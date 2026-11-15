import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLedger } from "../../lib/ledger.ts";
import type { Shift } from "../../lib/time.ts";
import { withoutPiece } from "./pieces.ts";

const zone = "Europe/Copenhagen";
// Sunday 22:00 to Monday 06:00 in Copenhagen (UTC+1 in November).
const night: Shift = { id: "n", start: "2026-11-15T21:00:00.000Z", end: "2026-11-16T05:00:00.000Z", notes: ["Late bus"], summaryStatus: "done" };
const span = (list: Shift[]) => list.map(s => [s.id, s.start, s.end]);

test("removing one day's part of an overnight shift keeps the other day's part", () => {
  const monday = dayLedger([night], "2026-11-16", zone)[0], sunday = dayLedger([night], "2026-11-15", zone)[0];
  assert.deepEqual(span(withoutPiece(monday)), [["n", "2026-11-15T21:00:00.000Z", "2026-11-15T23:00:00.000Z"]]);
  assert.deepEqual(span(withoutPiece(sunday)), [["n", "2026-11-15T23:00:00.000Z", "2026-11-16T05:00:00.000Z"]]);
  // The kept part keeps its notes; its summary was about the whole shift, so it is made again.
  assert.deepEqual(withoutPiece(monday)[0].notes, ["Late bus"]);
  assert.equal(withoutPiece(monday)[0].summaryStatus, undefined);
});

test("removing a shift that sits inside one day removes all of it", () => {
  const morning: Shift = { id: "m", start: "2026-11-16T05:45:00.000Z", end: "2026-11-16T07:10:00.000Z", notes: [] };
  assert.deepEqual(withoutPiece(dayLedger([morning], "2026-11-16", zone)[0]), []);
});

test("removing the middle day of a shift over two midnights keeps both ends", () => {
  const long: Shift = { id: "l", start: "2026-11-15T22:00:00.000Z", end: "2026-11-17T01:00:00.000Z", notes: [] };
  const kept = withoutPiece(dayLedger([long], "2026-11-16", zone)[0]);
  assert.deepEqual(kept.map(s => [s.start, s.end]), [["2026-11-15T22:00:00.000Z", "2026-11-15T23:00:00.000Z"], ["2026-11-16T23:00:00.000Z", "2026-11-17T01:00:00.000Z"]]);
  assert.equal(kept[0].id, "l");
  assert.notEqual(kept[1].id, "l");
});
