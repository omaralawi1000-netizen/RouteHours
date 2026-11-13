/** Pure helpers for shift reminders: checking input and working out what is due. No network here. */

export type ReminderAction = "start" | "finish";
export type Reminder = { id: string; time: string; title: string; body: string; action: ReminderAction };
export type Device = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  reminders: Reminder[];
  days: number[]; // 1 = Monday ... 7 = Sunday
  sent: Record<string, string>; // reminder id -> date it last went out (yyyy-mm-dd, Copenhagen)
  createdAt: string;
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
  return value.slice(0, 8).flatMap((r, i): Reminder[] => {
    if (!r || typeof r !== "object") return [];
    const x = r as Record<string, unknown>;
    if (typeof x.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)) return [];
    const action: ReminderAction = x.action === "finish" ? "finish" : "start";
    const text = (s: unknown, max: number) => typeof s === "string" ? s.trim().slice(0, max) : "";
    return [{ id: text(x.id, 40) || `r${i}`, time: x.time, title: text(x.title, 60) || "RouteHours", body: text(x.body, 140), action }];
  });
}

export function cleanDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  return [...new Set(value.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
}

/** Today's date and the minutes since midnight, in Copenhagen time. */
export function copenhagenNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

/** A reminder is due from its time until 20 minutes after, once a day, so a late or repeated ping never doubles it. */
export function due(device: Device, now = copenhagenNow()): Reminder[] {
  if (!device.days.includes(now.weekday)) return [];
  return device.reminders.filter(r => {
    const [h, m] = r.time.split(":").map(Number);
    const at = h * 60 + m;
    return now.minutes >= at && now.minutes < at + 20 && device.sent[r.id] !== now.date;
  });
}
