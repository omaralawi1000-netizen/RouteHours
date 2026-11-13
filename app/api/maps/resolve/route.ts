import { NextRequest, NextResponse } from "next/server";
import { isMapsHost, parseMapsLink } from "../parse";

export const runtime = "nodejs";

/**
 * Turns a short Google Maps share link (maps.app.goo.gl/…) into its full directions link, so the
 * app can read the start and end. Only follows Google hosts, at most five hops.
 */
export async function GET(request: NextRequest) {
  let url = request.nextUrl.searchParams.get("url") ?? "";
  for (let hop = 0; hop < 5; hop++) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return NextResponse.json({ error: "That isn't a link." }, { status: 400 }); }
    if (parsed.protocol !== "https:" || !isMapsHost(parsed.hostname)) return NextResponse.json({ error: "Paste a Google Maps link." }, { status: 400 });
    const route = parseMapsLink(url);
    if (route.to) return NextResponse.json(route, { headers: { "cache-control": "no-store" } });
    let next: string | null = null;
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15) RouteHours" } });
      next = response.headers.get("location");
    } catch { break; }
    if (!next) break;
    url = new URL(next, url).href;
  }
  return NextResponse.json(parseMapsLink(url), { headers: { "cache-control": "no-store" } });
}
