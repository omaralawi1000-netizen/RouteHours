import { test } from "node:test";
import assert from "node:assert/strict";
import { findLink, isMapsHost, isShortLink, parseMapsLink, shortPlace, transitNow } from "./parse.ts";

test("finds the link inside Google Maps' share text", () => {
  assert.equal(findLink("Aarhus H to Viby Torv - Google Maps https://maps.app.goo.gl/AbC123xyz"), "https://maps.app.goo.gl/AbC123xyz");
  assert.equal(findLink("no link here"), null);
  assert.ok(isShortLink("https://maps.app.goo.gl/AbC123xyz"));
  assert.ok(!isShortLink("https://example.com/x"));
});

test("reads start and end from the usual directions link shapes", () => {
  const path = parseMapsLink("https://www.google.com/maps/dir/Aarhus+H,+8000+Aarhus+C/Viby+Torv,+8260+Viby+J/@56.13,10.17,13z/data=!3m1!4b1!4m2!4m1!3e3");
  assert.equal(path.from, "Aarhus H, 8000 Aarhus C");
  assert.equal(path.to, "Viby Torv, 8260 Viby J");
  assert.equal(shortPlace(path.to!), "Viby Torv");
  const api = parseMapsLink("https://www.google.com/maps/dir/?api=1&origin=Aarhus%20H&destination=Viby%20Torv&travelmode=transit");
  assert.deepEqual([api.from, api.to], ["Aarhus H", "Viby Torv"]);
  const old = parseMapsLink("https://maps.google.com/?saddr=My+Location&daddr=Viby+Torv");
  assert.deepEqual([old.from, old.to], [null, "Viby Torv"]);
  const consent = parseMapsLink(`https://consent.google.com/m?continue=${encodeURIComponent("https://www.google.com/maps/dir/Aarhus+H/Viby+Torv/")}`);
  assert.deepEqual([consent.from, consent.to], ["Aarhus H", "Viby Torv"]);
});

test("opens transit directions leaving now, or the saved link when it can't tell", () => {
  const link = transitNow({ url: "x", from: "Aarhus H", to: "Viby Torv" });
  const params = new URL(link).searchParams;
  assert.equal(params.get("travelmode"), "transit");
  assert.equal(params.get("origin"), "Aarhus H");
  assert.equal(transitNow({ url: "https://maps.app.goo.gl/A", from: null, to: null }), "https://maps.app.goo.gl/A");
  assert.ok(isMapsHost("www.google.dk") && isMapsHost("maps.app.goo.gl") && !isMapsHost("evil.com") && !isMapsHost("google.com.evil.com"));
});
