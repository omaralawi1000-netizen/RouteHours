import { localDateKey, thisWeekStart, type Shift } from "./time.ts";

export type PayrollProfile = { name: string; number: string; email: string };
export type DayDetail = { syg?: string; fri?: string; sh?: string; andet?: string; remarks?: string };
export type DayDetails = Record<string, DayDetail>;
export type TimesheetRow = { day: string; date: string; start: string; end: string; minutes: number; syg: string; fri: string; sh: string; andet: string };
export type WeeklyReport = { title: string; monday: string; sunday: string; profile: PayrollProfile; rows: TimesheetRow[]; remarks: { day: string; date: string; text: string }[]; total: number; zone: string; includesNotes: boolean };
const weekdays = ["Man", "Tirs", "Ons", "Tors", "Fre", "Lør", "Søn"];
export const reportHeaders = ["Dag", "Dato", "Mødetid i bussen", "Tur slut", "Syg", "Fri", "SH", "Andet", "I alt"];
export function localDay(key: string) { return new Date(`${key}T00:00:00`); }
export function moveWeek(key: string, weeks: number) { const d = thisWeekStart(localDay(key)); d.setDate(d.getDate() + weeks * 7); return localDateKey(d.toISOString()); }
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
function time(date: Date) { return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }

export function buildWeeklyReport(shifts: Shift[], selected: string, profile: PayrollProfile, details: DayDetails, includesNotes = true): WeeklyReport {
  const monday = moveWeek(selected, 0);
  const rows: TimesheetRow[] = [];
  const remarks: WeeklyReport["remarks"] = [];
  for (let index = 0; index < 7; index++) {
    const dayStart = localDay(monday); dayStart.setDate(dayStart.getDate() + index);
    const next = new Date(dayStart); next.setDate(next.getDate() + 1);
    const date = localDateKey(dayStart.toISOString());
    const detail = details[date] || {};
    const pieces = shifts.filter(s => new Date(s.start) < next && new Date(s.end) > dayStart)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    for (let i = 0; i < Math.max(2, pieces.length); i++) {
      const shift = pieces[i];
      const start = shift ? new Date(Math.max(new Date(shift.start).getTime(), dayStart.getTime())) : null;
      const end = shift ? new Date(Math.min(new Date(shift.end).getTime(), next.getTime())) : null;
      // Cumulative rounding preserves the saved duration when a shift crosses midnight.
      const minutes = shift && start && end ? Math.round((end.getTime() - new Date(shift.start).getTime()) / 60000) - Math.round((start.getTime() - new Date(shift.start).getTime()) / 60000) : 0;
      rows.push({ day: weekdays[index], date, start: start ? time(start) : "", end: end ? end.getTime() === next.getTime() ? "24:00" : time(end) : "", minutes, syg: i ? "" : detail.syg || "", fri: i ? "" : detail.fri || "", sh: i ? "" : detail.sh || "", andet: i ? "" : detail.andet || "" });
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
      if (content.length) lines.push(`${time(new Date(shift.start))}–${time(new Date(shift.end))}\n${content.join("\n")}`);
    }
    remarks.push({ day: weekdays[index], date, text: lines.filter(Boolean).join("\n\n") });
  }
  return { title: weekTitle(monday), monday, sunday: remarks[6].date, profile: { ...profile }, rows, remarks, total: rows.reduce((sum, row) => sum + row.minutes, 0), zone: Intl.DateTimeFormat().resolvedOptions().timeZone, includesNotes };
}

// Text cells are explicitly strings in both export formats, never user-supplied formulas.
export function reportRows(report: WeeklyReport): (string | number)[][] {
  return [
    [report.title], ["Navn", report.profile.name, "", "", "Løn-nr.", report.profile.number],
    [`${displayDate(report.monday)} – ${displayDate(report.sunday)} · ${report.zone}`],
    reportHeaders,
    ...report.rows.map(r => [r.day, displayDate(r.date), r.start, r.end, r.syg, r.fri, r.sh, r.andet, r.minutes / 1440]),
    ["I alt · arbejdstid", "", "", "", "", "", "", "", report.total / 1440],
    ["Syg/Fri/SH/Andet er manuelle angivelser og indgår ikke i arbejdstiden."],
    [], ["Bemærkninger"],
    ...report.remarks.map(r => [r.day, displayDate(r.date), r.text]),
  ];
}
