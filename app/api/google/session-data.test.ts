import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSession, grantFrom, packCookie, tokenError, unpackCookie } from "./session-data.ts";

const clientId = "123-abc.apps.googleusercontent.com";

test("only takes known Google requests with a real client ID", () => {
  assert.deepEqual(checkSession({ action: "disconnect" }), { action: "disconnect" });
  assert.deepEqual(checkSession({ action: "token", clientId }), { action: "token", clientId });
  assert.ok("error" in checkSession({ action: "token", clientId: "nope" }));
  assert.ok("error" in checkSession({ action: "connect", clientId, code: "4/abc" }), "connect needs the secret");
  assert.ok("error" in checkSession({ action: "connect", clientId, secret: "GOCSPX-x", code: "" }));
  assert.ok("error" in checkSession({ action: "connect", clientId, secret: "has space", code: "4/abc" }));
  assert.deepEqual(checkSession({ action: "connect", clientId, secret: " GOCSPX-x ", code: "4/abc" }), { action: "connect", clientId, secret: "GOCSPX-x", code: "4/abc" });
  assert.ok("error" in checkSession({ action: "steal", clientId }));
});

test("the sign-in cookie round-trips and rejects anything tampered or incomplete", () => {
  const saved = { clientId, secret: "GOCSPX-x", refresh: "1//refresh", email: "driver@example.com" };
  assert.deepEqual(unpackCookie(packCookie(saved)), saved);
  assert.equal(unpackCookie(undefined), null);
  assert.equal(unpackCookie("not-a-cookie"), null);
  assert.equal(unpackCookie(Buffer.from(JSON.stringify({ v: 1, c: clientId, s: "x", r: "", e: "a@b.c" })).toString("base64url")), null);
  assert.equal(unpackCookie(Buffer.from(JSON.stringify({ v: 2, c: clientId, s: "x", r: "y", e: "a@b.c" })).toString("base64url")), null);
});

test("reads Google's token answer and explains its errors", () => {
  const grant = grantFrom({ access_token: "ya29.x", expires_in: 3599, scope: "a b", refresh_token: "1//r" });
  assert.equal(grant?.token, "ya29.x");
  assert.equal(grant?.refresh, "1//r");
  assert.ok(grant!.expires > Date.now() + 3400_000 && grant!.expires < Date.now() + 3600_000);
  assert.equal(grantFrom({ error: "invalid_grant" }), null);
  assert.equal(grantFrom({ access_token: "ya29.x" })?.refresh, "");
  assert.match(tokenError("invalid_grant", true), /Publish app/);
  assert.match(tokenError("invalid_grant", false), /expired/);
  assert.match(tokenError("invalid_client", true), /client secret/);
});
