/**
 * Pure helpers for /api/google/session: checking requests, packing the long-lasting Google sign-in
 * into an httpOnly cookie, and turning Google's token errors into plain messages.
 */

export const COOKIE = "rh_google";
const CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;
const PRINTABLE = /^[\x21-\x7e]+$/;

export type Saved = { clientId: string; secret: string; refresh: string; email: string };
export type SessionTask =
  | { action: "connect"; clientId: string; secret: string; code: string }
  | { action: "token"; clientId: string }
  | { action: "disconnect" };

const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && PRINTABLE.test(value.trim()) ? value.trim() : "";

export function checkSession(data: unknown): SessionTask | { error: string } {
  const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (body.action === "disconnect") return { action: "disconnect" };
  const clientId = text(body.clientId, 200);
  if (!CLIENT_ID.test(clientId)) return { error: "Save your Google Web client ID in Settings first." };
  if (body.action === "token") return { action: "token", clientId };
  if (body.action !== "connect") return { error: "Unknown Google request." };
  const secret = text(body.secret, 200), code = text(body.code, 2048);
  if (!secret) return { error: "Paste your Google client secret in Settings to stay signed in." };
  if (!code) return { error: "Google didn't send a sign-in code. Try again." };
  return { action: "connect", clientId, secret, code };
}

export function packCookie(saved: Saved) {
  return Buffer.from(JSON.stringify({ v: 1, c: saved.clientId, s: saved.secret, r: saved.refresh, e: saved.email })).toString("base64url");
}
export function unpackCookie(value: string | undefined): Saved | null {
  if (!value || value.length > 4000) return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (data?.v !== 1) return null;
    const saved = { clientId: text(data.c, 200), secret: text(data.s, 200), refresh: text(data.r, 1024), email: text(data.e, 254) };
    return CLIENT_ID.test(saved.clientId) && saved.secret && saved.refresh && saved.email.includes("@") ? saved : null;
  } catch { return null; }
}

/** Google's token endpoint errors, in words a driver can act on. */
export function tokenError(code: unknown, refreshing: boolean) {
  if (code === "invalid_client" || code === "unauthorized_client") return "Google rejected the client secret. Copy it again from Google Cloud and paste it in Settings.";
  if (code === "invalid_grant") return refreshing
    ? "Your Google sign-in ended. Connect Google again. If this happens every week, publish the app in Google Cloud (Audience, then Publish app)."
    : "That sign-in code expired. Tap Connect again.";
  if (code === "redirect_uri_mismatch") return "Google rejected this website address. Add it to the client's Authorized JavaScript origins.";
  return "Google couldn't finish signing in. Try again in a moment.";
}

/** Access tokens from Google last about an hour; keep a little margin. */
export function grantFrom(data: unknown) {
  const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const token = text(body.access_token, 8192);
  const seconds = Number(body.expires_in);
  if (!token) return null;
  const lifetime = Number.isFinite(seconds) && seconds > 60 ? seconds : 3600;
  return { token, expires: Date.now() + (lifetime - 60) * 1000, scope: typeof body.scope === "string" ? body.scope : "", refresh: text(body.refresh_token, 1024) };
}
