import { dateInZone, timeInZone } from "@/lib/ledger";

export function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function formatTime(value: string, zone: string) { return timeInZone(value, zone); }
export function formatDay(value: string, zone: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
/** The value a datetime-local input expects, in the work timezone. */
export function localInput(value: string, zone: string) { return dateInZone(value, zone) + "T" + timeInZone(value, zone); }
/** Drops empty lines and the old note-prompt headings from a note draft. */
export function cleanNoteDraft(value: string) { return value.split("\n").map(line => line.trim()).filter(line => line && !/^(Route timing|Support provided|Follow-up):$/i.test(line)).join("\n"); }
