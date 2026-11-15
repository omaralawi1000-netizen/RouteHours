/** Pure helpers for shift reminders: checking input and working out what is due. No network here. */

export type ReminderAction = "start" | "finish" | "leave";
/** `day` is set when the reminder falls on the day after (1) or before (-1) the shift's own day, as with an overnight shift. */
export type Reminder = { id: string; time: string; title: string; body: string; action: ReminderAction; day?: 1 | -1 };
export type Device = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  reminders: Reminder[];
  days: number[]; // 1 = Monday ... 7 = Sunday
  sent: Record<string, string>; // reminder id -> date it last went out (yyyy-mm-dd, in the device's zone)
  createdAt: string;
  /** The phone's work time zone. Older devices have none and use Copenhagen. */
  zone?: string;
};
export const ZONE = "Europe/Copenhagen";
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /\.microsoft\.com$/];

export function cleanSubscription(value: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof v.endpoint !== "string" || v.endpoint.length > 1000) return null;
  let url: URL;
  try { url = new URL(v.endpoint); } catch { return null; }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some(host => host.test(url.hostname))) return null;
  const p256dh = v.keys?.p256dh, auth = v.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: v.endpoint, keys: { p256dh, auth } };
}

export function cleanReminders(value: unknown): Reminder[] {
  if (!Array.isArray(value)) return [];
  // Up to eight usual parts (the templates allow eight), each with a leave, start and finish reminder.
  return value.slice(0, 24).flatMap((r, i): Reminder[] => {
    if (!r || typeof r !== "object") return [];
    const x = r as Record<string, unknown>;
    if (typeof x.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)) return [];
    const action: ReminderAction = x.action === "finish" || x.action === "leave" ? x.action : "start";
    const text = (s: unknown, max: number) => typeof s === "string" ? s.trim().slice(0, max) : "";
    const day = x.day === 1 || x.day === -1 ? { day: x.day as 1 | -1 } : {};
    // Template ids may be up to 80 characters, and the app adds "-start", "-end" or "-leave", so the
    // limit leaves room for the suffix: cutting it off would give a part's reminders the same id.
    return [{ id: text(x.id, 100) || `r${i}`, time: x.time, title: text(x.title, 60) || "RouteHours", body: text(x.body, 140), action, ...day }];
  });
}

export function cleanDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  return [...new Set(value.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
}

/** A time zone the server can use, or Copenhagen. */
export function cleanZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) return ZONE;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: value }); return value; } catch { return ZONE; }
}

/** Today's date and the minutes since midnight, in Copenhagen time (or another zone). */
export function copenhagenNow(now = new Date(), zone = ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

/** A reminder that is due, with the date it belongs to: a 23:57 reminder sent at 00:00 is yesterday's. */
export type DueReminder = Reminder & { date: string };

/** The date before a yyyy-mm-dd date. */
function dayBefore(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/**
 * A reminder is due from its time until 20 minutes after, also across midnight (a 23:57 reminder is
 * still due at 00:00), once per date, so a late or repeated ping never doubles it.
 */
export function due(device: Device, now = copenhagenNow()): DueReminder[] {
  return device.reminders.flatMap(r => {
    const [h, m] = r.time.split(":").map(Number);
    const at = h * 60 + m;
    if ((now.minutes - at + 1440) % 1440 >= 20) return [];
    // Past midnight, the reminder is yesterday's: its date and weekday are yesterday's.
    const yesterday = now.minutes < at;
    const date = yesterday ? dayBefore(now.date) : now.date;
    const weekday = yesterday ? (now.weekday + 5) % 7 + 1 : now.weekday;
    // The working days are the shifts' days: a finish at 06:00 after a Friday night shift goes out on Saturday.
    const shiftDay = (weekday - 1 - (r.day ?? 0) + 7) % 7 + 1;
    if (!device.days.includes(shiftDay) || device.sent[r.id] === date) return [];
    return [{ ...r, date }];
  });
}

/**
 * Gives back reminders whose delivery failed, so the next tick retries them. Another writer (the phone
 * updating its subscription) may have saved the file since the claim, so on a conflict it re-reads the
 * latest file and clears only this tick's own claims (id -> the date it claimed), keeping everything else.
 */
export async function releaseClaims(
  device: Device, etag: string, claims: Record<string, string>,
  io: { read: () => Promise<{ device: Device; etag: string } | null>; write: (device: Device, etag: string) => Promise<string | null> },
  attempts = 3,
): Promise<boolean> {
  let current: { device: Device; etag: string } | null = { device, etag };
  for (let i = 0; i < attempts && current; i++) {
    const next = { ...current.device, sent: { ...current.device.sent } };
    for (const [id, date] of Object.entries(claims)) if (next.sent[id] === date) delete next.sent[id];
    if (await io.write(next, current.etag)) return true;
    current = await io.read();
  }
  return false;
}
