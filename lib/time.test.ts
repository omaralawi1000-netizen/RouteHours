import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, minutesBetween, shiftsCsv, thisWeekStart } from "./time.ts";

test("a shift crossing midnight keeps its full duration", () => {
  assert.equal(minutesBetween("2026-09-25T22:45:00+02:00", "2026-09-26T01:15:00+02:00"), 150);
});

test("the week begins on Monday", () => {
  assert.equal(thisWeekStart(new Date(2026, 8, 27)).getDay(), 1);
});

test("CSV escapes notes and preserves payroll minutes", () => {
  assert.equal(csvCell('Bus, "late"'), '"Bus, ""late"""');
  const csv = shiftsCsv([{ id: "1", start: "2026-09-25T08:00:00+02:00", end: "2026-09-25T09:30:00+02:00", notes: ['Route, "A"'] }], true);
  assert.match(csv, /,90,1\.5000,/);
  assert.match(csv, /"Route, ""A"""/);
});
