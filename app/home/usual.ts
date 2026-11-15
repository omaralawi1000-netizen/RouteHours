import { DEFAULT_TEMPLATES, type ShiftTemplate } from "@/lib/templates";
import { addDays, dateInZone, timeInZone, zonedInstant } from "@/lib/ledger";

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
 * following one (Morning until about 10:15), and the last one until 45 minutes before it ends.
 */
export function nextPart(parts: DayPart[], now: number): DayPart | null {
  // After midnight, last night's overnight part (22:00–06:00) comes before any daytime part.
  const overnight = parts.find(p => now + 1440 < toMinutes(p.start) + p.minutes - 45);
  if (overnight) return overnight;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i], following = parts[i + 1];
    // Start plus length, so an overnight part (22:00–06:00) ends at 30:00, not 06:00.
    const end = toMinutes(part.start) + part.minutes;
    const cutoff = following ? (end + toMinutes(following.start)) / 2 : end - 45;
    if (now < cutoff) return part;
  }
  return null;
}

/** Whether a clock time falls between `before` minutes ahead of a part's start and its usual end, also across midnight. */
export function inPart(part: DayPart, now: number, before = 0) {
  const from = toMinutes(part.start) - before, to = toMinutes(part.start) + part.minutes;
  return [now - 1440, now, now + 1440].some(t => t >= from && t <= to);
}

/** When a part usually ends, on the date the run began. */
export function usualEnd(startedAt: number, part: DayPart, zone: string) {
  const date = dateInZone(startedAt, zone);
  // An overnight part ends tomorrow, unless the run began after midnight (00:10 on a 22:00–06:00 part): then today.
  const nextDay = part.end < part.start && zoneMinutes(startedAt, zone) > toMinutes(part.end);
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
