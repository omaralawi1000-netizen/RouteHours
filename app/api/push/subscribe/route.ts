import { NextRequest, NextResponse } from "next/server";
import { cleanDays, cleanReminders, cleanSubscription, configured, readState, writeState } from "../store";

export const runtime = "nodejs";

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try { const data = await request.json(); return data && typeof data === "object" ? data as Record<string, unknown> : null; } catch { return null; }
}

/** Save (or replace) this phone's reminders. */
export async function POST(request: NextRequest) {
  if (!configured().store) return NextResponse.json({ error: "Reminder storage isn't set up yet." }, { status: 503 });
  const data = await body(request);
  const subscription = cleanSubscription(data?.subscription);
  if (!subscription) return NextResponse.json({ error: "That isn't a valid push subscription." }, { status: 400 });
  const reminders = cleanReminders(data?.reminders);
  const days = cleanDays(data?.days);
  const state = await readState();
  const old = state.devices.find(d => d.endpoint === subscription.endpoint);
  state.devices = state.devices.filter(d => d.endpoint !== subscription.endpoint);
  state.devices.push({ ...subscription, reminders, days, sent: old?.sent ?? {}, createdAt: old?.createdAt ?? new Date().toISOString() });
  await writeState(state);
  return NextResponse.json({ ok: true, reminders: reminders.length, days });
}

/** Forget this phone. */
export async function DELETE(request: NextRequest) {
  if (!configured().store) return NextResponse.json({ ok: true });
  const data = await body(request);
  const endpoint = typeof data?.endpoint === "string" ? data.endpoint : "";
  const state = await readState();
  const before = state.devices.length;
  state.devices = state.devices.filter(d => d.endpoint !== endpoint);
  if (state.devices.length !== before) await writeState(state);
  return NextResponse.json({ ok: true });
}
