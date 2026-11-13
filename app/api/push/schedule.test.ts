import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDays, cleanReminders, cleanSubscription, copenhagenNow, due, type Device } from "./schedule.ts";

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
  assert.deepEqual(cleanDays([5, 1, 1, 9, "2"]), [1, 5]);
  assert.deepEqual(cleanDays(undefined), [1, 2, 3, 4, 5]);
});
