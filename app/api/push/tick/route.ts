import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { configured, copenhagenNow, due, readDevice, readDevices, releaseClaims, removeDevice, send, writeDevice } from "../store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowed(request: NextRequest) {
  const expected = process.env.PUSH_CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const received = header || request.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called every few minutes by a timer (a cron service). Sends any reminder whose time has come,
 * once per day, and forgets phones that have unsubscribed.
 */
export async function GET(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const ready = configured();
  if (!ready.push || !ready.store) return NextResponse.json({ error: "Push isn't set up yet.", ...ready }, { status: 503 });
  const at = new Date();
  const stored = await readDevices();
  let sent = 0;
  for (const { device, etag } of stored) {
    // Each phone's reminders follow its own work time zone.
    const now = copenhagenNow(at, device.zone);
    const reminders = due(device, now);
    if (!reminders.length) continue;
    // Claim first: mark the reminders as sent and save with the etag we read. If another tick (or the
    // phone itself) wrote in between, the save fails and this tick leaves the phone alone, so two
    // overlapping ticks can never both send the same reminder.
    // Dated by the reminder's own day, so a 23:57 reminder sent at 00:00 still counts as last night's.
    for (const reminder of reminders) device.sent[reminder.id] = reminder.date;
    const claimed = await writeDevice(device, etag);
    if (!claimed) continue;
    let gone = false;
    const failed: Record<string, string> = {};
    for (const reminder of reminders) {
      const result = await send(device, { title: reminder.title, body: reminder.body, tag: reminder.id, action: reminder.action });
      if (result === "gone") { gone = true; break; }
      if (result === "ok") sent++;
      else failed[reminder.id] = reminder.date;
    }
    if (gone) { await removeDevice(device.endpoint); continue; }
    // A delivery that failed is released again so the next tick (inside the 20 minute window) retries it.
    // If the phone saved its file meanwhile, the release re-reads it and retries, keeping the phone's change.
    if (Object.keys(failed).length) await releaseClaims(device, claimed, failed, { read: () => readDevice(device.endpoint), write: writeDevice });
  }
  return NextResponse.json({ ok: true, sent, devices: stored.length, at: at.toISOString() }, { headers: { "cache-control": "no-store" } });
}
