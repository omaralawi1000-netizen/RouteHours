import { NextRequest, NextResponse } from "next/server";
import { cleanSubscription, configured, send } from "../store";

export const runtime = "nodejs";

/** Sends one sample reminder straight to the phone that asked, so you can see it on the lock screen. */
export async function POST(request: NextRequest) {
  if (!configured().push) return NextResponse.json({ error: "Push keys aren't set up yet." }, { status: 503 });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const subscription = cleanSubscription((data as { subscription?: unknown })?.subscription);
  if (!subscription) return NextResponse.json({ error: "That isn't a valid push subscription." }, { status: 400 });
  const result = await send(subscription, { title: "Morning shift at 06:45", body: "This is a test. Tap Start shift and the timer starts.", tag: "test", action: "start" });
  return result === "ok" ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result === "gone" ? "This phone isn't subscribed any more." : "The push service refused it." }, { status: 502 });
}
