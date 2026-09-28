import type { Shift } from './time.ts';

export const DEFAULT_ZONE = 'Europe/Copenhagen';
const dates = new Map<string, Intl.DateTimeFormat>(), times = new Map<string, Intl.DateTimeFormat>();
const boundaries = new Map<string, number>();
export function dateInZone(value: string | number, zone = DEFAULT_ZONE) {
  if (!dates.has(zone)) dates.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  const parts = dates.get(zone)!.formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
export function timeInZone(value: string | number, zone = DEFAULT_ZONE) {
  if (!times.has(zone)) times.set(zone, new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  return times.get(zone)!.format(new Date(value));
}
export function addDays(key: string, days: number) { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function mondayOf(key: string) { const day = new Date(`${key}T12:00:00Z`).getUTCDay(); return addDays(key, -((day + 6) % 7)); }
// Resolve a wall-clock time in the saved work timezone, independent of the device.
export function zonedInstant(local: string, zone = DEFAULT_ZONE, rejectAmbiguous = false) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Choose a valid date and time.');
  const target = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Choose a valid date and time.');
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const shown = `${dateInZone(candidate, zone)}T${timeInZone(candidate, zone)}`;
    candidate += target - Date.parse(`${shown}:00Z`);
  }
  if (`${dateInZone(candidate, zone)}T${timeInZone(candidate, zone)}` !== local) throw new Error('This time does not exist because the clocks change. Choose another time.');
  if (rejectAmbiguous && [-3600000, 3600000].some(offset => `${dateInZone(candidate + offset, zone)}T${timeInZone(candidate + offset, zone)}` === local)) throw new Error('This time occurs twice when the clocks change. Keep the recorded time or choose an unambiguous time.');
  return new Date(candidate).toISOString();
}
export type DayPiece = { shift: Shift; date: string; start: string; end: string; minutes: number; endsAtMidnight: boolean };
function midnight(date: string, zone: string) {
  const key = date + zone;
  if (!boundaries.has(key)) { if (boundaries.size > 1000) boundaries.clear(); boundaries.set(key, Date.parse(zonedInstant(`${date}T00:00`, zone))); }
  return boundaries.get(key)!;
}
export function dayLedger(shifts: Shift[], date: string, zone = DEFAULT_ZONE): DayPiece[] {
  const lower = midnight(date, zone);
  const upper = midnight(addDays(date, 1), zone);
  return shifts.filter(s => Date.parse(s.start) < upper && Date.parse(s.end) > lower).sort((a,b) => Date.parse(a.start) - Date.parse(b.start)).map(shift => {
    const original = Date.parse(shift.start), start = Math.max(original, lower), end = Math.min(Date.parse(shift.end), upper);
    return { shift, date, start: new Date(start).toISOString(), end: new Date(end).toISOString(), endsAtMidnight: end === upper, minutes: Math.round((end - original) / 60000) - Math.round((start - original) / 60000) };
  });
}
export function periodMinutes(shifts: Shift[], start: string, endExclusive: string, zone = DEFAULT_ZONE) {
  let total = 0;
  for (let date = start; date < endExclusive; date = addDays(date, 1)) total += dayLedger(shifts, date, zone).reduce((n, p) => n + p.minutes, 0);
  return total;
}
export function shiftWarnings(shifts: Shift[]) {
  const warnings: { ids: string[]; message: string }[] = [];
  const sorted = shifts.slice().sort((a,b) => Date.parse(a.start) - Date.parse(b.start));
  sorted.forEach((s, i) => {
    if (Date.parse(s.end) - Date.parse(s.start) > 12 * 3600000) warnings.push({ ids: [s.id], message: 'A shift is longer than 12 hours. Check its finish time.' });
    for (let j = i + 1; j < sorted.length && Date.parse(sorted[j].start) < Date.parse(s.end); j++) warnings.push({ ids: [s.id, sorted[j].id], message: s.start === sorted[j].start && s.end === sorted[j].end ? 'Two shifts have the same times. Check for a duplicate.' : 'Two shifts overlap. Check before sending your hours.' });
  });
  return warnings;
}
