import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildWeeklyReport, moveWeek, weekTitle } from "./timesheet.ts";
import { createTimesheetFile } from "./timesheet-file.ts";
import type { Shift } from "./time.ts";

process.env.TZ = "Europe/Copenhagen";
const profile = { name: "Test Worker", number: "00123", email: "" };
const shift = (start: string, end: string, notes: string[] = []): Shift => ({ id: start, start, end, notes });

test("ISO week uses the correct year across New Year", () => {
  assert.equal(weekTitle("2024-12-30"), "Uge 1 - 2025");
  assert.equal(weekTitle("2021-01-01"), "Uge 53 - 2020");
  assert.equal(moveWeek("2025-01-05", 1), "2025-01-06");
});
test("weekly sheet reproduces split shifts and keeps absence separate from work", () => {
  const report = buildWeeklyReport([
    shift("2024-12-30T07:00:00+01:00", "2024-12-30T09:00:00+01:00", ["Route timing: on time"]),
    shift("2024-12-30T13:00:00+01:00", "2024-12-30T15:00:00+01:00"),
    shift("2025-01-06T07:00:00+01:00", "2025-01-06T09:00:00+01:00"),
  ], "2024-12-30", profile, { "2024-12-31": { syg: "2:00", fri: "x", remarks: "Sick day" } });
  assert.equal(report.total, 240);
  assert.equal(report.rows.length, 14);
  assert.deepEqual(report.rows.slice(0, 2).map(r => [r.start, r.end, r.minutes]), [["07:00", "09:00", 120], ["13:00", "15:00", 120]]);
  assert.equal(report.rows[2].syg, "2:00");
  assert.equal(report.rows[3].syg, "");
  assert.match(report.remarks[0].text, /on time/);
  assert.equal(report.remarks[1].text, "Sick day");
});
test("extra shifts and each AI section survive export; exclude-notes is honored", () => {
  const shifts = [7, 10, 13].map(h => shift(`2026-09-28T${String(h).padStart(2, "0")}:00:00+02:00`, `2026-09-28T${String(h+1).padStart(2, "0")}:00:00+02:00`, ["Original note"]));
  shifts[0].summary = { overview: "Overview", activities: ["Activity"], notable: ["Notable"], followUp: ["Follow up"] };
  const report = buildWeeklyReport(shifts, "2026-09-28", profile, {});
  assert.equal(report.rows.length, 15); assert.equal(report.total, 180);
  for (const text of ["Overview", "Activity", "Notable", "Follow up", "Original note"]) assert.ok(report.remarks[0].text.includes(text));
  assert.equal(buildWeeklyReport(shifts, "2026-09-28", profile, {}, false).remarks[0].text, "");
});
test("overnight shifts are clipped to the selected week without losing rounded minutes", () => {
  const shifts = [shift("2026-09-27T23:59:40+02:00", "2026-09-28T00:01:20+02:00")];
  const previous = buildWeeklyReport(shifts, "2026-09-21", profile, {});
  const next = buildWeeklyReport(shifts, "2026-09-28", profile, {});
  assert.equal(previous.total + next.total, 2);
  assert.equal(previous.rows[12].end, "24:00");
  assert.equal(next.rows[0].start, "00:00");
});
test("daylight saving uses elapsed hours, not wall-clock subtraction", () => {
  const report = buildWeeklyReport([shift("2026-10-25T01:00:00+02:00", "2026-10-25T04:00:00+01:00")], "2026-10-19", profile, {});
  assert.equal(report.total, 240);
  assert.equal(report.rows[12].start, "01:00");
  assert.equal(report.rows[12].end, "04:00");
});
test("Excel retains leading zeros, literal user text, all notes and totals over 24h", async () => {
  const report = buildWeeklyReport([
    shift("2026-09-28T00:00:00+02:00", "2026-09-30T02:00:00+02:00", ['=HYPERLINK("https://example.com")', "long note ".repeat(250)]),
  ], "2026-09-28", { ...profile, name: "=1+1" }, {});
  const file = await createTimesheetFile(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Ugeseddel")!;
  assert.equal(sheet.getCell("B2").value, "=1+1");
  assert.equal(sheet.getCell("F2").value, "00123");
  const total = sheet.getCell(`I${5 + report.rows.length}`);
  assert.equal(total.numFmt, "[h]:mm");
  const cached = (total.value as ExcelJS.CellFormulaValue).result;
  const serial = cached instanceof Date ? (cached.getTime() - Date.UTC(1899, 11, 30)) / 86400000 : cached;
  assert.equal(serial, 50 / 24);
  assert.equal((total.value as ExcelJS.CellFormulaValue).formula, `SUM(I5:I${4 + report.rows.length})`);
  assert.ok(workbook.getWorksheet("Bemærkninger fulde"));
});
