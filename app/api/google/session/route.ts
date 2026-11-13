import { NextRequest, NextResponse } from "next/server";
import { COOKIE, checkSession, grantFrom, packCookie, tokenError, unpackCookie } from "../session-data";

export const runtime = "nodejs";

/**
 * Keeps Google signed in on this phone. Google's browser sign-in only lasts an hour, so:
 * - connect: trades a one-time sign-in code for a long-lasting refresh token, kept in an httpOnly cookie
 *   that only this server can read (never visible to page scripts),
 * - token: uses that cookie to get a fresh hour of access without any Google window,
 * - disconnect: revokes the sign-in and deletes the cookie.
 * Nothing is stored on the server.
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const YEAR = 400 * 24 * 3600; // Browsers cap cookie lifetimes at 400 days.

function reply(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function setCookie(response: NextResponse, value: string, request: NextRequest) {
  response.cookies.set(COOKIE, value, { httpOnly: true, secure: request.nextUrl.protocol === "https:" || request.nextUrl.hostname === "localhost", sameSite: "strict", path: "/api/google", maxAge: value ? YEAR : 0 });
  return response;
}
async function google(url: string, form: Record<string, string>) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form), cache: "no-store", signal: AbortSignal.timeout(15000) });
  return { ok: response.ok, data: await response.json().catch(() => ({})) as Record<string, unknown> };
}
async function revoke(token: string) {
  try { await google(REVOKE_URL, { token }); } catch { /* Revoking is best effort. */ }
}
async function emailOf(token: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null);
  return response.ok && typeof data?.email === "string" ? data.email as string : "";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ error: "That request didn't come through. Try again." }, 400); }
  const task = checkSession(body);
  if ("error" in task) return reply({ error: task.error }, 400);
  const saved = unpackCookie(request.cookies.get(COOKIE)?.value);

  try {
    if (task.action === "disconnect") {
      if (saved) await revoke(saved.refresh);
      return setCookie(reply({ ok: true }), "", request);
    }

    if (task.action === "token") {
      if (!saved || saved.clientId !== task.clientId) return reply({ error: "Not signed in to Google on this phone yet." }, 401);
      const out = await google(TOKEN_URL, { client_id: saved.clientId, client_secret: saved.secret, refresh_token: saved.refresh, grant_type: "refresh_token" });
      const grant = out.ok ? grantFrom(out.data) : null;
      if (!grant) {
        const response = reply({ error: tokenError(out.data.error, true) }, out.data.error === "invalid_grant" || out.data.error === "invalid_client" ? 401 : 502);
        return out.data.error === "invalid_grant" ? setCookie(response, "", request) : response;
      }
      return reply({ token: grant.token, expires: grant.expires, scope: grant.scope, email: saved.email });
    }

    // The popup sign-in hands back a code meant for this page, so Google expects "postmessage" here.
    const out = await google(TOKEN_URL, { client_id: task.clientId, client_secret: task.secret, code: task.code, redirect_uri: "postmessage", grant_type: "authorization_code" });
    const grant = out.ok ? grantFrom(out.data) : null;
    if (!grant) return reply({ error: tokenError(out.data.error, false) }, 400);
    const email = await emailOf(grant.token);
    if (!email) { await revoke(grant.token); return reply({ error: "Google didn't share your email address. Connect again and allow it." }, 400); }
    if (!grant.refresh) {
      // Google only hands out a long-lasting sign-in on a fresh approval. Revoke the old approval so the next
      // Connect shows the consent screen again and comes back with one.
      await revoke(grant.token);
      return reply({ error: "Google needs you to approve once more to stay signed in. Tap Connect again." }, 409);
    }
    const response = reply({ token: grant.token, expires: grant.expires, scope: grant.scope, email });
    return setCookie(response, packCookie({ clientId: task.clientId, secret: task.secret, refresh: grant.refresh, email }), request);
  } catch {
    return reply({ error: "Couldn't reach Google. Check your connection and try again." }, 502);
  }
}
