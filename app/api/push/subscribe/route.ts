import { NextRequest, NextResponse } from "next/server";
import { cleanDays, cleanReminders, cleanSubscription, configured, devicesFull, readDevice, removeDevice, send, writeDevice } from "../store";

export const runtime = "nodejs";

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try { const data = await request.json(); return data && typeof data === "object" ? data as Record<string, unknown> : null; } catch { return null; }
}

/**
 * Save (or replace) this phone's reminders. A phone that is new here must first receive a real
 * "Reminders are on" notification, which proves it is a working subscription and not a made-up one.
 */
export async function POST(request: NextRequest) {
  const ready = configured();
  if (!ready.store || !ready.push) return NextResponse.json({ error: "Reminders aren't set up on the server yet." }, { status: 503 });
  const data = await body(request);
  const subscription = cleanSubscription(data?.subscription);
  if (!subscription) return NextResponse.json({ error: "That isn't a valid push subscription." }, { status: 400 });
  const reminders = cleanReminders(data?.reminders);
  const days = cleanDays(data?.days);
  const old = (await readDevice(subscription.endpoint))?.device;
  if (!old) {
    if (await devicesFull()) return NextResponse.json({ error: "Reminders are already on for 5 phones. Turn them off on one first." }, { status: 409 });
    const proof = await send(subscription, { title: "Reminders are on", body: "You'll get a nudge before each usual shift.", tag: "reminders-on" });
    if (proof !== "ok") return NextResponse.json({ error: "Couldn't reach this phone. Try turning reminders on again." }, { status: 400 });
  }
  await writeDevice({ ...subscription, reminders, days, sent: old?.sent ?? {}, createdAt: old?.createdAt ?? new Date().toISOString() });
  return NextResponse.json({ ok: true, reminders: reminders.length, days });
}

/** Forget this phone. */
export async function DELETE(request: NextRequest) {
  if (!configured().store) return NextResponse.json({ ok: true });
  const data = await body(request);
  const endpoint = typeof data?.endpoint === "string" ? data.endpoint : "";
  if (endpoint) await removeDevice(endpoint);
  return NextResponse.json({ ok: true });
}
