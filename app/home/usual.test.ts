import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPart, partsFrom, toMinutes, usualEnd } from "./usual.ts";

const split = partsFrom([{ id: "morning", name: "Morning", start: "06:45", end: "08:10" }, { id: "afternoon", name: "Afternoon", start: "12:25", end: "14:45" }]);
const night = partsFrom([{ id: "night", name: "Night", start: "00:02", end: "02:00" }]);

test("the next part follows the day: Morning, then Afternoon, then nothing in the evening", () => {
  assert.equal(nextPart(split, toMinutes("05:00"))?.id, "morning");
  assert.equal(nextPart(split, toMinutes("11:00"))?.id, "afternoon");
  // From 45 minutes before the last part ends, the evening offers to log the day instead.
  assert.equal(nextPart(split, toMinutes("21:00")), null);
});

test("a part just after midnight is already next in the minutes before it, like its reminder says", () => {
  // The Start reminder for 00:02 comes at 23:57 the evening before.
  assert.equal(nextPart(night, toMinutes("23:57"))?.id, "night");
  assert.equal(nextPart(night, toMinutes("23:20"))?.id, "night");
  assert.equal(nextPart(night, toMinutes("00:30"))?.id, "night");
  // Not hours ahead, though: the evening still belongs to the day that is ending.
  assert.equal(nextPart(night, toMinutes("21:00")), null);
  assert.equal(nextPart(split, toMinutes("23:57")), null);
});

test("a run started just before midnight for a part after midnight usually ends the next morning", () => {
  const zone = "Europe/Copenhagen";
  const end = (startedAt: string, part: typeof split[number]) => new Date(usualEnd(Date.parse(startedAt), part, zone)).toISOString();
  const overnight = partsFrom([{ id: "late", name: "Late", start: "22:00", end: "06:00" }])[0];
  // 23:57 on 14 Nov in Copenhagen is 22:57 UTC; the 00:02 part ends at 02:00 on 15 Nov.
  assert.equal(end("2026-11-14T22:57:00Z", night[0]), "2026-11-15T01:00:00.000Z");
  assert.equal(end("2026-11-14T23:04:00Z", night[0]), "2026-11-15T01:00:00.000Z");
  // Unchanged: a morning part, and an overnight part started before or after midnight.
  assert.equal(end("2026-11-15T05:50:00Z", split[0]), "2026-11-15T07:10:00.000Z");
  assert.equal(end("2026-11-14T20:55:00Z", overnight), "2026-11-15T05:00:00.000Z");
  assert.equal(end("2026-11-14T23:10:00Z", overnight), "2026-11-15T05:00:00.000Z");
});
