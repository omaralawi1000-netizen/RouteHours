import type { GoogleAccount } from './google-auth.ts';

export type GoogleService = 'google' | 'drive' | 'gmail';
export const GOOGLE_SESSION_EVENT = 'routehours:google-session';
const sessions = new Map<string, GoogleAccount>(), identities = new Map<string, string>();
const emailValid = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
function key(clientId: string, service: GoogleService) { return 'routehours:google-' + service + ':' + clientId; }
function storage(name: 'localStorage' | 'sessionStorage') { try { return typeof window === 'undefined' ? undefined : window[name]; } catch { return undefined; } }
function notify() { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(GOOGLE_SESSION_EVENT)); }
function valid(account: unknown): account is GoogleAccount {
  const value = account as GoogleAccount | null;
  return Boolean(value && emailValid(value.email) && typeof value.token === 'string' && /^[\x21-\x7e]{1,8192}$/.test(value.token) && Number.isFinite(value.expires) && value.expires > Date.now() && value.expires <= Date.now() + 24 * 3600000);
}

/** A remembered identity never grants API access by itself. */
export function savedGoogleEmail(clientId: string, service: GoogleService): string {
  if (!clientId) return '';
  const name = key(clientId, service);
  try { const email = storage('localStorage')?.getItem(name + ':email'); if (emailValid(email)) { identities.set(name,email); return email; } } catch { /* Use memory when storage is blocked. */ }
  return identities.get(name) || '';
}
/** Short-lived credentials survive tab reloads, separately from permanent settings and backups. */
export function cachedGoogleAccount(clientId: string, service: GoogleService): GoogleAccount | null {
  if (!clientId) return null;
  const name = key(clientId, service), memory = sessions.get(name);
  if (valid(memory)) return { ...memory };
  sessions.delete(name);
  try {
    const value = JSON.parse(storage('sessionStorage')?.getItem(name) || 'null');
    if (value?.version === 1 && value.clientId === clientId && value.service === service && valid(value.account)) {
      sessions.set(name,value.account); return { ...value.account };
    }
    storage('sessionStorage')?.removeItem(name);
  } catch { try { storage('sessionStorage')?.removeItem(name); } catch { /* Storage may be blocked. */ } }
  return null;
}
export function rememberGoogleAccount(clientId: string, service: GoogleService, account: GoogleAccount) {
  if (!clientId || !valid(account)) throw new Error('Google returned an invalid or expired account session.');
  const name = key(clientId, service), copy = {email:account.email,token:account.token,expires:account.expires};
  sessions.set(name,copy); identities.set(name,copy.email);
  try { storage('sessionStorage')?.setItem(name,JSON.stringify({version:1,clientId,service,account:copy})); } catch { /* The connection still survives Settings visits in memory. */ }
  try { storage('localStorage')?.setItem(name + ':email',copy.email); } catch { /* The account still works in this app session. */ }
  notify();
}
export function clearGoogleSession(clientId: string, service: GoogleService) {
  sessions.delete(key(clientId,service));
  try { storage('sessionStorage')?.removeItem(key(clientId,service)); } catch { /* Never extend an invalid session. */ }
  notify();
}
