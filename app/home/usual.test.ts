import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPart, partsFrom, toMinutes, usualEnd, usualStart } from "./usual.ts";

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

test("the usual start of a late run is found on the work clock, also across a clock change", () => {
  const zone = "Europe/Copenhagen";
  const start = (tapped: string, part: typeof split[number]) => new Date(usualStart(Date.parse(tapped), part, zone)!).toISOString();
  // 06:45 part, tapped 07:00 on 16 November.
  assert.equal(start("2026-11-16T06:00:00Z", split[0]), "2026-11-16T05:45:00.000Z");
  // 23:50 part, tapped 00:10: the usual start was the evening before.
  const late = partsFrom([{ id: "late", name: "Late", start: "23:50", end: "02:00" }])[0];
  assert.equal(start("2026-11-15T23:10:00Z", late), "2026-11-15T22:50:00.000Z");
  // 01:50 part, tapped 03:10 summer time on 29 March 2026, after the clocks jumped from 02:00 to 03:00: 20 real minutes late, not 80.
  const early = partsFrom([{ id: "early", name: "Early", start: "01:50", end: "05:00" }])[0];
  assert.equal(start("2026-03-29T01:10:00Z", early), "2026-03-29T00:50:00.000Z");
});

test("a short usual shift is still next at its reminder and its start", () => {
  const short = partsFrom([{ id: "short", name: "Short", start: "07:00", end: "07:30" }]);
  // Its Start reminder comes at 06:55.
  assert.equal(nextPart(short, toMinutes("06:55"))?.id, "short");
  assert.equal(nextPart(short, toMinutes("07:00"))?.id, "short");
  assert.equal(nextPart(short, toMinutes("07:10"))?.id, "short");
  // Past half of it, the day is done and the chip offers to log it instead.
  assert.equal(nextPart(short, toMinutes("07:20")), null);
  // A long last part keeps the 45-minute rule: Afternoon 12:25–14:45 until 14:00.
  assert.equal(nextPart(split, toMinutes("13:59"))?.id, "afternoon");
  assert.equal(nextPart(split, toMinutes("14:00")), null);
});

test("in the hour repeated when the clocks go back, the usual start is the one before the tap", () => {
  const zone = "Europe/Copenhagen";
  const night = partsFrom([{ id: "n", name: "Night", start: "02:30", end: "05:00" }])[0];
  // 25 October 2026: 02:00–03:00 happens twice. Tapped at the first 02:50 (00:50 UTC): the usual start is the first 02:30.
  assert.equal(new Date(usualStart(Date.parse("2026-10-25T00:50:00Z"), night, zone)!).toISOString(), "2026-10-25T00:30:00.000Z");
  // Tapped at the second 02:50 (01:50 UTC): the second 02:30.
  assert.equal(new Date(usualStart(Date.parse("2026-10-25T01:50:00Z"), night, zone)!).toISOString(), "2026-10-25T01:30:00.000Z");
});
