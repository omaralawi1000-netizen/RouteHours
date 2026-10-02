import test from "node:test";
import assert from "node:assert/strict";
import { GOOGLE_EMAIL_SCOPE, GOOGLE_FILE_SCOPE, googleAccount, googleAuthReady, normalizeGoogleClientId, requestGoogleToken, validGoogleClientId, type GoogleTokenResponse } from "./google-auth.ts";
import { gmailToken, GMAIL_SCOPE } from "./gmail.ts";

const id = "123-example.apps.googleusercontent.com";
type Config = { scope: string; include_granted_scopes: boolean; callback: (response: GoogleTokenResponse) => void; error_callback: (error: { type?: string }) => void };
function browser(init?: (config: Config) => { requestAccessToken: (options: { prompt: string }) => void }) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://route-hours.vercel.app" }, ...(init ? { google: { accounts: { oauth2: { initTokenClient: init } } } } : {}) } });
  return () => { if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window"); };
}

test("Google client input accepts plain/Web JSON IDs and rejects desktop JSON", () => {
  assert.equal(normalizeGoogleClientId(`  "${id}" `), id);
  assert.equal(normalizeGoogleClientId(JSON.stringify({ web: { client_id: id, client_secret: "ignored" } })), id);
  assert.equal(validGoogleClientId(normalizeGoogleClientId(JSON.stringify({ installed: { client_id: id } }))), false);
  assert.equal(validGoogleClientId("not a client"), false);
});
test("Missing Google library rejects promptly with a loading recovery action", async () => {
  const restore = browser();
  try { assert.equal(googleAuthReady(), false); await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /has not loaded.*reload RouteHours/); }
  finally { restore(); }
});
test("Popup requests run synchronously from the caller and retain reported lifetime", async () => {
  let opened = false;
  const restore = browser(config => {
    assert.equal(config.include_granted_scopes, false);
    return { requestAccessToken: options => { assert.equal(options.prompt, "select_account"); opened = true; config.callback({ access_token: "mock", scope: GOOGLE_FILE_SCOPE, expires_in: 90 }); } };
  });
  try {
    const before = Date.now(), pending = requestGoogleToken(id, GOOGLE_FILE_SCOPE);
    assert.equal(opened, true, "Popup opens before an await can consume browser activation");
    const grant = await pending;
    assert.equal(grant.token, "mock"); assert.ok(grant.expires >= before + 59000 && grant.expires <= Date.now() + 60000);
  } finally { restore(); }
});
test("Popup close, blocked popup and OAuth configuration errors release the request", async () => {
  let failure = "popup_closed";
  const restore = browser(config => ({ requestAccessToken: () => {
    if (failure.startsWith("popup_")) config.error_callback({ type: failure }); else config.callback({ error: failure });
  } }));
  try {
    await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /was closed/);
    failure = "popup_failed_to_open"; await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /Allow pop-ups/);
    failure = "origin_mismatch"; await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /https:\/\/route-hours.vercel.app.*Authorized JavaScript origins/);
    failure = "invalid_client"; await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /Web application client ID/);
    failure = "access_denied"; await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /test users and consent settings/);
    failure = "invalid_request"; await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /Web client configuration/);
  } finally { restore(); }
});
test("Missing Gmail grant is rejected before account lookup or sending", async () => {
  const originalFetch = globalThis.fetch; let fetched = false;
  const restore = browser(config => ({ requestAccessToken: () => config.callback({ access_token: "mock", scope: GOOGLE_EMAIL_SCOPE, expires_in: 3600 }) }));
  globalThis.fetch = async () => { fetched = true; return new Response("{}"); };
  try { await assert.rejects(gmailToken(id), /permissions were not granted.*Nothing was sent/); assert.equal(fetched, false); }
  finally { restore(); globalThis.fetch = originalFetch; }
});
test("An explicitly expired token is rejected instead of receiving a fallback lifetime", async () => {
  const restore = browser(config => ({ requestAccessToken: () => config.callback({ access_token: "expired", scope: config.scope, expires_in: 0 }) }));
  try { await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /expired or invalid session/); }
  finally { restore(); }
});
test("Silent Google failure times out and ignores late responses before a new attempt", async () => {
  let old: Config | undefined, calls = 0;
  const restore = browser(config => ({ requestAccessToken: () => {
    calls++; if (calls === 1) old = config;
    else { old?.callback({ access_token: "stale", scope: GOOGLE_EMAIL_SCOPE, expires_in: 3600 }); config.callback({ access_token: "new", scope: GOOGLE_EMAIL_SCOPE, expires_in: 3600 }); }
  } }));
  try {
    await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE, { timeoutMs: 5 }), /timed out/);
    assert.equal((await requestGoogleToken(id, GOOGLE_EMAIL_SCOPE)).token, "new");
  } finally { restore(); }
});
test("Abort and overlapping auth requests settle cleanly", async () => {
  const restore = browser(() => ({ requestAccessToken: () => {} }));
  try {
    const controller = new AbortController(), first = requestGoogleToken(id, GOOGLE_EMAIL_SCOPE, { signal: controller.signal });
    await assert.rejects(requestGoogleToken(id, GOOGLE_EMAIL_SCOPE), /already open/);
    controller.abort(); await assert.rejects(first, /cancelled/);
    const secondController = new AbortController(), second = requestGoogleToken(id, GOOGLE_EMAIL_SCOPE, { signal: secondController.signal });
    secondController.abort(); await assert.rejects(second, /cancelled/);
  } finally { restore(); }
});
test("Settings account lookup requests only email while Gmail requests send separately", async () => {
  const requests: string[] = [], originalFetch = globalThis.fetch;
  const restore = browser(config => ({ requestAccessToken: () => { requests.push(config.scope); config.callback({ access_token: "mock", scope: config.scope, expires_in: 120 }); } }));
  globalThis.fetch = async () => new Response(JSON.stringify({ email: "worker@example.com" }));
  try {
    assert.equal((await googleAccount(id)).email, "worker@example.com");
    assert.equal((await gmailToken(id)).email, "worker@example.com");
    assert.deepEqual(requests, [GOOGLE_EMAIL_SCOPE, `${GMAIL_SCOPE} ${GOOGLE_EMAIL_SCOPE}`]);
    globalThis.fetch = async () => new Response("{}", { status: 401 });
    await assert.rejects(googleAccount(id), /session expired/);
  } finally { restore(); globalThis.fetch = originalFetch; }
});
