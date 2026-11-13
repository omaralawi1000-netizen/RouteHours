/**
 * Google Maps links, made useful for a bus driver: pull the start and end out of a shared
 * directions link, and build a link that opens Google Maps on public transport *leaving now*,
 * so the next bus is the first thing on screen.
 */
export type MapsRoute = { url: string; from: string | null; to: string | null };

const MAPS_HOSTS = /^(www\.|maps\.)?google\.(com|dk|de|se|no|co\.uk)$/;
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

/** The first https link in whatever was pasted (Maps' share text puts words around it). */
export function findLink(text: string): string | null {
  const match = text.match(/https:\/\/[^\s<>"']+/);
  if (!match) return null;
  try { return new URL(match[0].replace(/[).,]+$/, "")).href; } catch { return null; }
}

export function isShortLink(url: string) {
  try { return SHORT_HOSTS.has(new URL(url).hostname); } catch { return false; }
}

export function isMapsHost(host: string) { return MAPS_HOSTS.test(host) || SHORT_HOSTS.has(host) || host === "consent.google.com"; }

const clean = (place: string | null | undefined) => {
  if (!place) return null;
  const text = decodeURIComponent(place.replace(/\+/g, " ")).trim();
  return text && !/^my location$|^your location$/i.test(text) ? text : null;
};

/** Start and end of a full Google Maps directions link, when it has them. */
export function parseMapsLink(url: string): MapsRoute {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { url, from: null, to: null }; }
  // The EU cookie page wraps the real link.
  if (parsed.hostname === "consent.google.com" && parsed.searchParams.get("continue")) return parseMapsLink(parsed.searchParams.get("continue")!);
  const q = parsed.searchParams;
  if (q.get("origin") || q.get("destination")) return { url, from: clean(q.get("origin")), to: clean(q.get("destination")) };
  if (q.get("saddr") || q.get("daddr")) return { url, from: clean(q.get("saddr")), to: clean(q.get("daddr")) };
  const parts = parsed.pathname.split("/");
  const dir = parts.indexOf("dir");
  if (dir >= 0) {
    const places = parts.slice(dir + 1).filter(p => p && !p.startsWith("@") && !p.startsWith("data="));
    return { url, from: clean(places[0]), to: clean(places[1]) };
  }
  return { url, from: null, to: null };
}

/** The short name to show: "Aarhus H, 8000 Aarhus C" becomes "Aarhus H". */
export function shortPlace(place: string) { return place.split(",")[0].trim(); }

/** Opens Google Maps on public transport from start to end, leaving now. Falls back to the saved link. */
export function transitNow(route: MapsRoute): string {
  if (!route.to) return route.url;
  const params = new URLSearchParams({ api: "1", destination: route.to, travelmode: "transit" });
  if (route.from) params.set("origin", route.from);
  return `https://www.google.com/maps/dir/?${params}`;
}
