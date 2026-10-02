import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildWeeklyReport, columnLetter, dailyReportRows, moveWeek, reportLayout, weekTitle } from "./timesheet.ts";
import { createTimesheetFile } from "./timesheet-file.ts";
import { createGoogleSheet } from "./sheets.ts";
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
test("daily export shows each date once with both runs and expands for a third run", () => {
  const shifts = [7, 10, 13].map(h => shift(`2026-09-28T${String(h).padStart(2, "0")}:00:00+02:00`, `2026-09-28T${String(h+1).padStart(2, "0")}:00:00+02:00`));
  const report = buildWeeklyReport(shifts, "2026-09-28", profile, { "2026-09-29": { syg: "x", remarks: "Syg" } }, false);
  const before = JSON.stringify(report);
  const layout = reportLayout(report);
  assert.equal(layout.dailyRows.length, 7);
  assert.equal(new Set(layout.dailyRows.map(row => row.date)).size, 7);
  assert.deepEqual(layout.dailyRows[0].intervals.map(row => [row.start, row.end]), [["07:00", "08:00"], ["10:00", "11:00"], ["13:00", "14:00"]]);
  assert.equal(layout.dailyRows[0].minutes, 180);
  assert.equal(layout.intervalCount, 3);
  assert.equal(layout.dailyRows[1].syg, "x");
  assert.equal(layout.dailyRows[1].minutes, 0);
  assert.equal(layout.totalIndex, 11);
  assert.equal(layout.headers[layout.totalColumn], "I alt");
  assert.equal(layout.rows[4][6], "13:00");
  assert.equal(layout.rows[4][7], "14:00");
  assert.equal(layout.rows[4][layout.totalColumn], 180 / 1440);
  assert.deepEqual(layout.remarks.map(row => row.date), ["2026-09-29"]);
  assert.equal(JSON.stringify(report), before, "presentation must not change frozen receipt fingerprints");
});
test("a week without remarks retains two interval pairs and omits the empty remarks section", async () => {
  const report = buildWeeklyReport([], "2026-09-28", profile, {}, false);
  const layout = reportLayout(report);
  assert.equal(layout.intervalCount, 2);
  assert.equal(layout.rows.length, 13);
  assert.equal(layout.remarksIndex, null);
  assert.equal(layout.headers.length, 11);
  const file = await createTimesheetFile(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Ugeseddel")!;
  assert.equal(sheet.rowCount, 13);
  assert.equal(sheet.pageSetup.fitToHeight, 1);
  assert.equal(sheet.pageSetup.printArea, "A1:K13");
  assert.equal(sheet.getCell("A5").value, "Man");
  assert.equal(sheet.getCell("A6").value, "Tirs");
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
  const layout = reportLayout(report);
  const letter = columnLetter(layout.totalColumn);
  const total = sheet.getCell(`${letter}${layout.totalIndex + 1}`);
  assert.equal(total.numFmt, "[h]:mm");
  const cached = (total.value as ExcelJS.CellFormulaValue).result;
  const serial = cached instanceof Date ? (cached.getTime() - Date.UTC(1899, 11, 30)) / 86400000 : cached;
  assert.equal(serial, 50 / 24);
  assert.equal((total.value as ExcelJS.CellFormulaValue).formula, `SUM(${letter}5:${letter}${layout.totalIndex})`);
  assert.ok(workbook.getWorksheet("Bemærkninger fulde"));
});
test("Excel places split shifts side by side using real dates and time cells", async () => {
  const report = buildWeeklyReport([
    shift("2026-09-28T07:00:00+02:00", "2026-09-28T09:00:00+02:00"),
    shift("2026-09-28T13:00:00+02:00", "2026-09-28T15:00:00+02:00"),
    shift("2026-09-29T07:00:00+02:00", "2026-09-29T08:00:00+02:00"),
  ], "2026-09-28", profile, {}, false);
  const file = await createTimesheetFile(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Ugeseddel")!;
  assert.equal((sheet.getCell("B5").value as Date).toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(sheet.getCell("B5").numFmt, "dd.mm.yyyy");
  for (const [address, hour] of [["C5", 7], ["D5", 9], ["E5", 13], ["F5", 15]] as const) {
    const cell = sheet.getCell(address);
    assert.equal((cell.value as Date).getUTCHours(), hour);
    assert.equal(cell.numFmt, "[hh]:mm");
  }
  assert.equal(sheet.getCell("A6").value, "Tirs");
  assert.equal((sheet.getCell("K12").value as ExcelJS.CellFormulaValue).formula, "SUM(K5:K11)");
  assert.equal(dailyReportRows(report)[0].minutes, 240);
});
test("Google Sheets uses the same seven-day layout, extra runs, typed dates and dynamic total", async () => {
  const shifts = [7, 10, 13].map(h => shift(`2026-09-28T${String(h).padStart(2, "0")}:00:00+02:00`, `2026-09-28T${String(h+1).padStart(2, "0")}:00:00+02:00`));
  const report = buildWeeklyReport(shifts, "2026-09-28", { ...profile, name: "=1+1" }, {}, false);
  let payload: Record<string, any> | undefined;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ spreadsheetId: "test-id", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-id/edit" }), { status: 200 });
  };
  try {
    const result = await createGoogleSheet("test-token", shifts, report);
    assert.equal(result.complete, true);
    const tab = payload!.sheets[0];
    assert.equal(tab.properties.gridProperties.columnCount, 13);
    const rows = tab.data[0].rowData;
    assert.equal(rows.length, 13);
    assert.equal(rows[1].values[1].userEnteredValue.stringValue, "=1+1");
    assert.equal(rows[1].values[5].userEnteredValue.stringValue, "00123");
    assert.equal(rows[4].values[0].userEnteredValue.stringValue, "Man");
    assert.equal(rows[5].values[0].userEnteredValue.stringValue, "Tirs");
    assert.equal(rows[4].values[1].userEnteredFormat.numberFormat.type, "DATE");
    assert.equal(rows[4].values[6].userEnteredValue.numberValue, 13 / 24);
    assert.equal(rows[4].values[7].userEnteredValue.numberValue, 14 / 24);
    assert.equal(rows[11].values[12].userEnteredValue.formulaValue, "=SUM(M5:M11)");
    assert.equal(rows[11].values[12].userEnteredFormat.numberFormat.pattern, "[h]:mm");
    assert.ok(tab.merges.every((merge: Record<string, number>) => merge.endColumnIndex <= 13 && merge.endRowIndex <= 13));
  } finally { globalThis.fetch = previousFetch; }
});
