import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { configured, copenhagenNow, due, readState, send, writeState } from "../store";

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
  const now = copenhagenNow();
  const state = await readState();
  let sent = 0, changed = false;
  for (const device of [...state.devices]) {
    for (const reminder of due(device, now)) {
      const result = await send(device, { title: reminder.title, body: reminder.body, tag: reminder.id, action: reminder.action });
      if (result === "gone") { state.devices = state.devices.filter(d => d !== device); changed = true; break; }
      if (result === "ok") { device.sent[reminder.id] = now.date; sent++; changed = true; }
    }
  }
  if (changed) await writeState(state);
  return NextResponse.json({ ok: true, sent, devices: state.devices.length, at: now }, { headers: { "cache-control": "no-store" } });
}
