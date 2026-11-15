// Relative with extensions, so the unit tests can load this file in Node as it is.
import { DEFAULT_TEMPLATES, type ShiftTemplate } from "../../lib/templates.ts";
import { addDays, dateInZone, timeInZone, zonedInstant } from "../../lib/ledger.ts";

/** One part of the usual working day, taken from a saved shift template. */
export type DayPart = { id: string; label: string; start: string; end: string; minutes: number };

export const toMinutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
export const minutesToClock = (t: number) => `${String(Math.floor(((t % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((t % 60) + 60) % 60).padStart(2, "0")}`;
export function hm(raw: number) { const minutes = Math.max(0, raw); return `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`; }
export function hms(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
/** Minutes since midnight in the work time zone. */
export function zoneMinutes(at: number, zone: string) { return toMinutes(timeInZone(at, zone)); }

/** The usual day, in order: the saved templates (Morning, Afternoon…) sorted by start time. */
export function partsFrom(templates: ShiftTemplate[]): DayPart[] {
  return templates.slice().sort((a, b) => a.start.localeCompare(b.start))
    .map(t => ({ id: t.id, label: t.name, start: t.start, end: t.end, minutes: (toMinutes(t.end) - toMinutes(t.start) + 1440) % 1440 }));
}
export const dayMinutes = (parts: DayPart[]) => parts.reduce((sum, p) => sum + p.minutes, 0);

/**
 * The part that comes next, for the quick-start chip. A part stays "next" until halfway to the
 * following one (Morning until about 10:15), and the last one until 45 minutes before it ends
 * (halfway through, if it is shorter than 90 minutes). Late in the evening, tomorrow's first part
 * counts once it is 45 minutes away.
 */
export function nextPart(parts: DayPart[], now: number): DayPart | null {
  // The last part is next until 45 minutes before its end, or halfway through a short one (07:00–07:30
  // until 07:15), so it is never over before it starts. Start plus length, so 22:00–06:00 ends at 30:00.
  const lastCutoff = (p: DayPart) => toMinutes(p.start) + Math.max(p.minutes - 45, p.minutes / 2);
  // After midnight, last night's overnight part (22:00–06:00) comes before any daytime part.
  const overnight = parts.find(p => now + 1440 < lastCutoff(p));
  if (overnight) return overnight;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i], following = parts[i + 1];
    const end = toMinutes(part.start) + part.minutes;
    const cutoff = following ? (end + toMinutes(following.start)) / 2 : lastCutoff(part);
    if (now < cutoff) return part;
  }
  // A part just after midnight (00:02) is next from 45 minutes before it, as its Start reminder
  // (23:57) and the quick start already expect. Earlier in the evening the day is still ending.
  return parts.find(p => { const start = toMinutes(p.start) + 1440; return now < start && start - now <= 45; }) ?? null;
}

/** Whether a clock time falls between `before` minutes ahead of a part's start and its usual end, also across midnight. */
export function inPart(part: DayPart, now: number, before = 0) {
  const from = toMinutes(part.start) - before, to = toMinutes(part.start) + part.minutes;
  return [now - 1440, now, now + 1440].some(t => t >= from && t <= to);
}

/**
 * When a run that began at `startedAt` usually starts, as a real moment: the part's start that day, or
 * the evening before for a run tapped after midnight (23:50 part, tapped 00:10). Worked out on the work
 * clock, so a clock change in between doesn't add an hour. Null if the clocks skipped that time.
 */
export function usualStart(startedAt: number, part: DayPart, zone: string) {
  const date = dateInZone(startedAt, zone);
  const day = zoneMinutes(startedAt, zone) < toMinutes(part.start) ? addDays(date, -1) : date;
  let at: number;
  try { at = Date.parse(zonedInstant(`${day}T${part.start}`, zone)); } catch { return null; }
  // In the hour repeated when the clocks go back, 02:30 happens twice: take the one before the tap.
  const earlier = at - 3600000;
  return at > startedAt && timeInZone(earlier, zone) === part.start && dateInZone(earlier, zone) === day ? earlier : at;
}

/** When a part usually ends, on the date the run began. */
export function usualEnd(startedAt: number, part: DayPart, zone: string) {
  const date = dateInZone(startedAt, zone);
  const began = zoneMinutes(startedAt, zone);
  // An overnight part ends tomorrow, unless the run began after midnight (00:10 on a 22:00–06:00 part): then today.
  // So does a part just after midnight that was started the evening before (23:57 for 00:02).
  const nextDay = (part.end < part.start && began > toMinutes(part.end)) || began - toMinutes(part.start) > 720;
  try { return Date.parse(zonedInstant(`${nextDay ? addDays(date, 1) : date}T${part.end}`, zone)); } catch { return 0; }
}

/** Minutes after a run's usual end before an unfinished shift finishes itself. */
export const AUTO_FINISH_AFTER = 60;
/** EU driving rules: a 45-minute break is due after 4 h 30 min of driving. */
export const BREAK_AFTER = 270;

/**
 * Minutes driven since the last break that counts: 45 minutes in one go, or 15 minutes followed
 * later by 30 (the EU split break). A shorter stop pauses the count but doesn't reset it.
 */
export function drivenSinceRest(startedAt: number, breaks: { start: number; end?: number }[], end: number) {
  let driven = 0, from = startedAt, firstHalf = false;
  for (const b of breaks.slice().sort((x, y) => x.start - y.start)) {
    driven += Math.max(0, Math.min(b.start, end) - from) / 60000;
    if (!b.end) return driven;
    from = b.end;
    const length = (b.end - b.start) / 60000;
    if (length >= 45 || (firstHalf && length >= 30)) { driven = 0; firstHalf = false; }
    else if (length >= 15) firstHalf = true;
  }
  return driven + Math.max(0, end - from) / 60000;
}

/** Omar's usual split day, offered while the templates are still the app's defaults. */
export const SPLIT_DAY: ShiftTemplate[] = [
  { id: "morning", name: "Morning", start: "06:45", end: "08:10" },
  { id: "afternoon", name: "Afternoon", start: "12:25", end: "14:45" },
];
export function stillDefault(templates: ShiftTemplate[]) { return JSON.stringify(templates) === JSON.stringify(DEFAULT_TEMPLATES); }

/** Pay is an estimate before tax. The rate lives on this phone only. */
export const RATE_KEY = "routehours:rate";
export const DEFAULT_RATE = 180;
const krFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
export function kr(minutes: number, rate: number) { return `${krFormat.format(Math.round(minutes / 60 * rate))} kr`; }
