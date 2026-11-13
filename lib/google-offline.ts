import type { GoogleAccount } from './google-auth.ts';
import type { GoogleService } from './google-session.ts';

/**
 * "Stay signed in" for Google. The browser-only sign-in lasts an hour and needs a Google window every time.
 * With the client secret saved, Connect uses Google's code sign-in once; the server keeps the long-lasting
 * part in an httpOnly cookie and hands out fresh hours of access with no window at all.
 */
const EMAIL = 'https://www.googleapis.com/auth/userinfo.email';
const FILE = 'https://www.googleapis.com/auth/drive.file';
const GMAIL = 'https://www.googleapis.com/auth/gmail.send';
export const SERVICE_SCOPES: Record<GoogleService, string[]> = { google: [EMAIL], drive: [FILE, EMAIL], gmail: [GMAIL, EMAIL] };
const ALL_SCOPES = [EMAIL, FILE, GMAIL];

type CodeResponse = { code?: string; error?: string };
type CodeClient = { requestCode: () => void };
type GoogleBrowser = Window & { google?: { accounts?: { oauth2?: { initCodeClient?: (config: {
  client_id: string; scope: string; include_granted_scopes: boolean; ux_mode: 'popup'; login_hint?: string; select_account?: boolean;
  callback: (response: CodeResponse) => void; error_callback: (error: { type?: string }) => void;
}) => CodeClient } } } };
export type OfflineAccount = GoogleAccount & { scope: string };

function local() { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
const secretKey = (clientId: string) => 'routehours:google-secret:' + clientId;
const linkedKey = (clientId: string) => 'routehours:google-stay:' + clientId;

/** The secret from a pasted Web client JSON, or a pasted secret on its own. */
export function secretFromPaste(value: string): string {
  const trimmed = value.trim();
  try { const parsed = JSON.parse(trimmed); const secret = parsed?.web?.client_secret ?? parsed?.client_secret; return typeof secret === 'string' ? secret.trim() : ''; } catch { /* Not JSON. */ }
  return /^[\w-]{10,200}$/.test(trimmed) ? trimmed : '';
}
export function googleSecret(clientId: string) { try { return local()?.getItem(secretKey(clientId)) || ''; } catch { return ''; } }
export function rememberGoogleSecret(clientId: string, secret: string) {
  try { if (secret) local()?.setItem(secretKey(clientId), secret); else local()?.removeItem(secretKey(clientId)); } catch { /* Storage blocked: the secret works for this connect only. */ }
}
/** Whether this phone has a long-lasting Google sign-in for this client (the sign-in itself lives in the cookie). */
export function staysSignedIn(clientId: string) { try { return Boolean(clientId && local()?.getItem(linkedKey(clientId))); } catch { return false; } }
function markLinked(clientId: string, email: string) { try { if (email) local()?.setItem(linkedKey(clientId), email); else local()?.removeItem(linkedKey(clientId)); } catch { /* Ignore. */ } }

export function grantedServices(scope: string): GoogleService[] {
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  if (granted.has('email')) granted.add(EMAIL);
  return (Object.keys(SERVICE_SCOPES) as GoogleService[]).filter(service => SERVICE_SCOPES[service].every(s => granted.has(s)));
}
function account(data: Record<string, unknown>): OfflineAccount | null {
  const token = typeof data.token === 'string' ? data.token : '', email = typeof data.email === 'string' ? data.email : '';
  const expires = Number(data.expires);
  return token && email && Number.isFinite(expires) && expires > Date.now() ? { token, email, expires, scope: typeof data.scope === 'string' ? data.scope : '' } : null;
}
async function call(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch('/api/google/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  return { status: response.status, data: await response.json().catch(() => ({})) as Record<string, unknown> };
}

/** A fresh hour of access with no Google window, or null when this phone isn't signed in that way. */
export async function refreshGoogle(clientId: string, service: GoogleService, signal?: AbortSignal): Promise<OfflineAccount | null> {
  if (!staysSignedIn(clientId)) return null;
  try {
    const { status, data } = await call({ action: 'token', clientId }, signal);
    if (status === 401) { markLinked(clientId, ''); return null; }
    const fresh = account(data);
    return fresh && grantedServices(fresh.scope).includes(service) ? fresh : null;
  } catch { return null; }
}

/** Opens Google's window once and asks for everything RouteHours uses, so Sheets, backups and Gmail all stay signed in. Call from a tap. */
export function connectGoogle(clientId: string, secret: string, options: { loginHint?: string; chooseAccount?: boolean; signal?: AbortSignal } = {}): Promise<OfflineAccount> {
  return new Promise((resolve, reject) => {
    const init = typeof window === 'undefined' ? undefined : (window as GoogleBrowser).google?.accounts?.oauth2?.initCodeClient;
    if (!init) { reject(new Error('Google sign-in has not loaded. Check your connection, then reload RouteHours and try again.')); return; }
    let done = false;
    const finish = (error?: Error, value?: OfflineAccount) => { if (done) return; done = true; if (error) reject(error); else resolve(value!); };
    options.signal?.addEventListener('abort', () => finish(new Error('Google connection cancelled.')), { once: true });
    try {
      init({
        client_id: clientId, scope: ALL_SCOPES.join(' '), include_granted_scopes: true, ux_mode: 'popup',
        ...(options.loginHint && !options.chooseAccount ? { login_hint: options.loginHint } : {}), ...(options.chooseAccount ? { select_account: true } : {}),
        callback: async response => {
          if (response.error || !response.code) { finish(new Error(response.error === 'access_denied' ? 'Google access was not granted. Connect again and approve the permissions.' : 'Google could not finish signing in. Try again.')); return; }
          try {
            const { data } = await call({ action: 'connect', clientId, secret, code: response.code }, options.signal);
            const fresh = account(data);
            if (!fresh) { finish(new Error(typeof data.error === 'string' ? data.error : 'Google could not finish signing in. Try again.')); return; }
            markLinked(clientId, fresh.email);
            finish(undefined, fresh);
          } catch { finish(new Error('Could not reach RouteHours to finish signing in. Check your connection and try again.')); }
        },
        error_callback: error => finish(new Error(error.type === 'popup_closed' ? 'Google sign-in was closed. Tap Connect again when you are ready.' : error.type === 'popup_failed_to_open' ? 'Google sign-in could not open. Allow pop-ups for RouteHours and try again.' : 'Google sign-in did not finish. Try again.')),
      }).requestCode();
    } catch { finish(new Error('Google sign-in could not start. Check the Web client ID and try again.')); }
  });
}

export async function disconnectGoogle(clientId: string) {
  markLinked(clientId, '');
  try { await call({ action: 'disconnect' }); } catch { /* The cookie expires on its own if this fails. */ }
}
