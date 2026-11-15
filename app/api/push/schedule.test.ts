import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDays, cleanReminders, cleanSubscription, cleanZone, copenhagenNow, due, type Device } from "./schedule.ts";

const device = (over: Partial<Device> = {}): Device => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" }, days: [1, 2, 3, 4, 5], sent: {}, createdAt: "",
  reminders: [{ id: "am", time: "06:40", title: "Morning", body: "", action: "start" }, { id: "pm", time: "12:20", title: "Afternoon", body: "", action: "start" }],
  ...over,
});

test("Copenhagen time follows winter and summer time", () => {
  assert.deepEqual(copenhagenNow(new Date("2026-11-13T05:40:00Z")), { date: "2026-11-13", minutes: 6 * 60 + 40, weekday: 5 });
  assert.deepEqual(copenhagenNow(new Date("2026-07-01T04:40:00Z")), { date: "2026-07-01", minutes: 6 * 60 + 40, weekday: 3 });
  assert.equal(copenhagenNow(new Date("2026-11-15T10:00:00Z")).weekday, 7);
});

test("a reminder is due from its time for 20 minutes, once a day, on working days only", () => {
  const at = (date: string, minutes: number, weekday: number) => ({ date, minutes, weekday });
  assert.deepEqual(due(device(), at("2026-11-13", 6 * 60 + 39, 5)), []);
  assert.deepEqual(due(device(), at("2026-11-13", 6 * 60 + 40, 5)).map(r => r.id), ["am"]);
  assert.deepEqual(due(device(), at("2026-11-13", 6 * 60 + 59, 5)).map(r => r.id), ["am"]);
  assert.deepEqual(due(device(), at("2026-11-13", 7 * 60, 5)), []);
  assert.deepEqual(due(device({ sent: { am: "2026-11-13" } }), at("2026-11-13", 6 * 60 + 45, 5)), []);
  assert.deepEqual(due(device({ sent: { am: "2026-11-12" } }), at("2026-11-13", 6 * 60 + 45, 5)).map(r => r.id), ["am"]);
  assert.deepEqual(due(device(), at("2026-11-14", 6 * 60 + 45, 6)), []);
});

test("input is checked before it is stored", () => {
  assert.equal(cleanSubscription({ endpoint: "https://evil.example.com/x", keys: { p256dh: "k", auth: "a" } }), null);
  assert.equal(cleanSubscription({ endpoint: "http://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" } }), null);
  assert.ok(cleanSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "k", auth: "a" } }));
  assert.deepEqual(cleanReminders([{ time: "25:00" }, { time: "06:40", action: "finish", title: "x".repeat(99) }]).map(r => [r.time, r.action, r.title.length]), [["06:40", "finish", 60]]);
  assert.deepEqual(cleanReminders([{ time: "06:25", action: "leave" }, { time: "06:40", action: "nope" }]).map(r => r.action), ["leave", "start"]);
  assert.deepEqual(cleanDays([5, 1, 1, 9, "2"]), [1, 5]);
  assert.deepEqual(cleanDays(undefined), [1, 2, 3, 4, 5]);
});

test("a failed delivery is released even when the phone saved its file in between", async () => {
  const { releaseClaims } = await import("./schedule.ts");
  const base = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" }, reminders: [], days: [1], createdAt: "2026-11-13" };
  type Saved = { device: Device; etag: string };
  // The tick claimed "am-start" (and "pm-start" went out fine); the phone then changed its days, so the tick's etag is stale.
  let stored: Saved = { device: { ...base, days: [1, 2], sent: { "am-start": "2026-11-13", "pm-start": "2026-11-13" } }, etag: "v2" };
  const writes: string[] = [];
  const write = async (device: Device, etag: string) => { writes.push(etag); if (etag !== stored.etag) return null; stored = { device, etag: "v3" }; return "v3"; };
  const ok = await releaseClaims({ ...base, sent: { "am-start": "2026-11-13", "pm-start": "2026-11-13" } }, "v1", { "am-start": "2026-11-13" }, { read: async () => stored, write });
  assert.equal(ok, true);
  assert.deepEqual(writes, ["v1", "v2"]);
  assert.deepEqual(stored.device.sent, { "pm-start": "2026-11-13" }, "only the failed claim is cleared");
  assert.deepEqual(stored.device.days, [1, 2], "the phone's own change is kept");
});

test("a phone in another work time zone gets its reminders on its own clock", () => {
  // 05:40 UTC is 06:40 in Copenhagen but 05:40 in London (November).
  assert.equal(copenhagenNow(new Date("2026-11-13T05:40:00Z"), "Europe/London").minutes, 5 * 60 + 40);
  assert.equal(cleanZone("Europe/London"), "Europe/London");
  assert.equal(cleanZone("Not/AZone"), "Europe/Copenhagen");
  assert.equal(cleanZone(undefined), "Europe/Copenhagen");
});

test("four usual parts keep all twelve reminders", () => {
  const list = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, time: "06:40", title: "x", body: "y", action: "start" }));
  assert.equal(cleanReminders(list).length, 24);
});

test("an overnight finish goes out on the shift's next day, by the shift's weekday", () => {
  const at = (date: string, minutes: number, weekday: number) => ({ date, minutes, weekday });
  const night = device({ reminders: [{ id: "n-end", time: "06:00", title: "End", body: "", action: "finish", day: 1 }] });
  // Friday night's shift ends Saturday 06:00: sent. Monday 06:00 follows Sunday, not a working day: not sent.
  assert.deepEqual(due(night, at("2026-11-14", 6 * 60, 6)).map(r => r.id), ["n-end"]);
  assert.deepEqual(due(night, at("2026-11-16", 6 * 60, 1)), []);
  const early = device({ reminders: [{ id: "e-start", time: "23:55", title: "Start", body: "", action: "start", day: -1 }] });
  // A Monday 00:00 shift is nudged on Sunday 23:55; Friday 23:55 would be for Saturday: not sent.
  assert.deepEqual(due(early, at("2026-11-15", 23 * 60 + 55, 7)).map(r => r.id), ["e-start"]);
  assert.deepEqual(due(early, at("2026-11-13", 23 * 60 + 55, 5)), []);
  assert.deepEqual(cleanReminders([{ time: "06:00", day: 1 }, { time: "06:00", day: 3 }]).map(r => r.day), [1, undefined]);
});

test("a long template id keeps each reminder's suffix, so its reminders stay apart", () => {
  const id = "a".repeat(80);
  const ids = cleanReminders(["start", "end", "leave"].map(kind => ({ id: `${id}-${kind}`, time: "06:40" }))).map(r => r.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every(r => r.startsWith(id)));
});

test("a reminder just before midnight still goes out on a tick just after it", () => {
  const at = (date: string, minutes: number, weekday: number) => ({ date, minutes, weekday });
  // A Monday 00:02 part is nudged on Sunday 23:57. Ticking every five minutes, the tick after 23:55 is at 00:00.
  const early = device({ reminders: [{ id: "n-start", time: "23:57", title: "Start", body: "", action: "start", day: -1 }] });
  assert.deepEqual(due(early, at("2026-11-16", 0, 1)).map(r => [r.id, r.date]), [["n-start", "2026-11-15"]]);
  assert.deepEqual(due(early, at("2026-11-16", 16, 1)).map(r => r.id), ["n-start"]);
  assert.deepEqual(due(early, at("2026-11-16", 17, 1)), [], "20 minutes on, it is too late");
  // Sunday's reminder already went out (it is dated Sunday): not again after midnight, but again on Monday evening.
  const sent = { ...early, sent: { "n-start": "2026-11-15" } };
  assert.deepEqual(due(sent, at("2026-11-16", 0, 1)), []);
  assert.deepEqual(due(sent, at("2026-11-16", 23 * 60 + 57, 1)).map(r => r.id), ["n-start"]);
  // Friday 23:57 is for Saturday, not a working day: not sent at 00:00 on Saturday either.
  assert.deepEqual(due(early, at("2026-11-14", 0, 6)), []);
  // A reminder at 00:00 is today's, not yesterday's.
  const midnight = device({ reminders: [{ id: "m", time: "00:00", title: "x", body: "", action: "start" }] });
  assert.deepEqual(due(midnight, at("2026-11-16", 5, 1)).map(r => [r.id, r.date]), [["m", "2026-11-16"]]);
});
