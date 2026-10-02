import { thisWeekStart, type Shift } from "./time.ts";
import { addDays, mondayOf, dayLedger, timeInZone, DEFAULT_ZONE } from "./ledger.ts";

export type PayrollProfile = { name: string; number: string; email: string };
export type DayDetail = { syg?: string; fri?: string; sh?: string; andet?: string; remarks?: string };
export type DayDetails = Record<string, DayDetail>;
export type TimesheetRow = { day: string; date: string; start: string; end: string; minutes: number; syg: string; fri: string; sh: string; andet: string };
export type WeeklyReport = { title: string; monday: string; sunday: string; profile: PayrollProfile; rows: TimesheetRow[]; remarks: { day: string; date: string; text: string }[]; total: number; zone: string; includesNotes: boolean };
export type DailyTimesheetRow = Omit<TimesheetRow, "start" | "end"> & { intervals: { start: string; end: string; minutes: number }[] };
const weekdays = ["Man", "Tirs", "Ons", "Tors", "Fre", "Lør", "Søn"];
export const reportHeaders = ["Dag", "Dato", "Mødetid i bussen", "Tur slut", "Syg", "Fri", "SH", "Andet", "I alt"];
export function localDay(key: string) { return new Date(`${key}T00:00:00`); }
export function moveWeek(key: string, weeks: number) { return addDays(mondayOf(key), weeks * 7); }
export function hhmm(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`; }
export function displayDate(key: string) { return key.split("-").reverse().join("."); }
export function weekTitle(key: string) {
  const local = thisWeekStart(localDay(key));
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  d.setUTCDate(d.getUTCDate() + 3);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `Uge ${week} - ${year}`;
}

export function buildWeeklyReport(shifts: Shift[], selected: string, profile: PayrollProfile, details: DayDetails, includesNotes = true, zone = DEFAULT_ZONE): WeeklyReport {
  const monday = moveWeek(selected, 0);
  const rows: TimesheetRow[] = [];
  const remarks: WeeklyReport["remarks"] = [];
  for (let index = 0; index < 7; index++) {
    const date = addDays(monday, index);
    const detail = details[date] || {};
    const ledger = dayLedger(shifts, date, zone);
    const pieces = ledger.map(p => p.shift);
    for (let i = 0; i < Math.max(2, ledger.length); i++) {
      const piece = ledger[i];
      rows.push({ day: weekdays[index], date, start: piece ? timeInZone(piece.start, zone) : "", end: piece ? piece.endsAtMidnight ? "24:00" : timeInZone(piece.end, zone) : "", minutes: piece?.minutes || 0, syg: i ? "" : detail.syg || "", fri: i ? "" : detail.fri || "", sh: i ? "" : detail.sh || "", andet: i ? "" : detail.andet || "" });
    }
    const lines = [detail.remarks || ""];
    if (includesNotes) for (const shift of pieces) {
      const sections = shift.summary;
      const content = [...shift.notes.map(n => `Notat: ${n}`), ...(sections ? [
        sections.overview && `AI-resumé: ${sections.overview}`,
        sections.activities.length && `Aktiviteter: ${sections.activities.join("; ")}`,
        sections.notable.length && `Væsentligt: ${sections.notable.join("; ")}`,
        sections.followUp.length && `Opfølgning: ${sections.followUp.join("; ")}`,
      ].filter(Boolean) : [])];
      if (content.length) lines.push(`${timeInZone(shift.start, zone)}–${timeInZone(shift.end, zone)}\n${content.join("\n")}`);
    }
    remarks.push({ day: weekdays[index], date, text: lines.filter(Boolean).join("\n\n") });
  }
  return { title: weekTitle(monday), monday, sunday: remarks[6].date, profile: { ...profile }, rows, remarks, total: rows.reduce((sum, row) => sum + row.minutes, 0), zone, includesNotes };
}

// The saved report schema stays unchanged so historic email receipts retain their fingerprint.
// Only its presentation groups the recorded runs into one row per calendar day.
export function dailyReportRows(report: WeeklyReport): DailyTimesheetRow[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(report.monday, index);
    const rows = report.rows.filter(row => row.date === date);
    const field = (key: "syg" | "fri" | "sh" | "andet") => [...new Set(rows.map(row => row[key]).filter(Boolean))].join("; ");
    return {
      day: rows[0]?.day || weekdays[index], date,
      intervals: rows.filter(row => row.start || row.end).map(row => ({ start: row.start, end: row.end, minutes: row.minutes })),
      minutes: rows.reduce((sum, row) => sum + row.minutes, 0),
      syg: field("syg"), fri: field("fri"), sh: field("sh"), andet: field("andet"),
    };
  });
}

export function reportLayout(report: WeeklyReport) {
  const dailyRows = dailyReportRows(report);
  const intervalCount = Math.max(2, ...dailyRows.map(row => row.intervals.length));
  const headers = ["Dag", "Dato", ...Array.from({ length: intervalCount }, (_, i) => [`Start ${i + 1}`, `Slut ${i + 1}`]).flat(), "Syg", "Fri", "SH", "Andet", "I alt"];
  const totalColumn = headers.length - 1;
  const totalIndex = 4 + dailyRows.length;
  const remarks = report.remarks.filter(row => row.text.trim());
  const remarksIndex = remarks.length ? totalIndex + 3 : null;
  const totalRow: (string | number)[] = Array(headers.length).fill("");
  totalRow[0] = "I alt · arbejdstid";
  totalRow[totalColumn] = report.total / 1440;
  const rows: (string | number)[][] = [
    [report.title], ["Navn", report.profile.name, "", "", "Løn-nr.", report.profile.number],
    [`${displayDate(report.monday)} – ${displayDate(report.sunday)} · ${report.zone}`],
    headers,
    ...dailyRows.map(row => [row.day, displayDate(row.date), ...Array.from({ length: intervalCount }, (_, i) => [row.intervals[i]?.start || "", row.intervals[i]?.end || ""]).flat(), row.syg, row.fri, row.sh, row.andet, row.minutes / 1440]),
    totalRow,
    ["Syg/Fri/SH/Andet er manuelle angivelser og indgår ikke i arbejdstiden."],
  ];
  if (remarks.length) rows.push([], ["Bemærkninger"], ...remarks.map(row => [row.day, displayDate(row.date), row.text]));
  return { dailyRows, intervalCount, headers, totalColumn, totalIndex, remarksIndex, remarks, rows };
}

// Text values stay literal in both formats; only generated totals become formulas.
export function reportRows(report: WeeklyReport): (string | number)[][] { return reportLayout(report).rows; }

export function columnLetter(index: number) {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

export function timeSerial(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60 + minutes) / 1440;
}
