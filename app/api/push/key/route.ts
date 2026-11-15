import { NextResponse } from "next/server";
import { configured } from "../store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The public half of the push key, so the phone can subscribe, plus what is set up on the server. */
export async function GET() {
  const ready = configured();
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null, ...ready }, { headers: { "cache-control": "no-store" } });
}
