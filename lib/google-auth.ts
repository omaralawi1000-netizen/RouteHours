export const GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const GOOGLE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleToken = { token: string; expires: number };
export type GoogleAccount = GoogleToken & { email: string };
export type GoogleTokenResponse = { access_token?: string; expires_in?: number | string; scope?: string; error?: string; error_description?: string };
type TokenConfig = {
  client_id: string; scope: string; include_granted_scopes: boolean;
  callback: (response: GoogleTokenResponse) => void;
  error_callback: (error: { type?: string }) => void;
};
type GoogleOAuth = {
  initTokenClient: (config: TokenConfig) => { requestAccessToken: (options: { prompt: string }) => void };
  hasGrantedAllScopes?: (response: GoogleTokenResponse, firstScope: string, ...restScopes: string[]) => boolean;
};
type GoogleBrowser = Window & { google?: { accounts?: { oauth2?: GoogleOAuth } } };
let requestPending = false;

export function normalizeGoogleClientId(value: string) {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    // A downloaded desktop client cannot authorize this browser app.
    if (parsed?.installed) return trimmed;
    const fromJson = parsed?.web?.client_id || parsed?.client_id;
    if (typeof fromJson === "string") return fromJson.trim();
  } catch { /* Plain client IDs are the normal case. */ }
  return trimmed.replace(/^['"]|['"]$/g, "");
}
export function validGoogleClientId(value: string) { return /^[\w-]+\.apps\.googleusercontent\.com$/.test(value); }
function oauth() { return typeof window === "undefined" ? undefined : (window as GoogleBrowser).google?.accounts?.oauth2; }
export function googleAuthReady() { return typeof oauth()?.initTokenClient === "function"; }

function authorizationError(code?: string) {
  if (code === "access_denied") return new Error("Google access was not granted. Try connecting again and approve the requested permissions. If Google says access is blocked, check the project's test users and consent settings.");
  if (code === "invalid_client" || code === "unauthorized_client") return new Error("Google rejected this client ID. Use a Web application client ID from the Google project that owns the app.");
  if (code === "origin_mismatch" || code === "invalid_origin" || code === "redirect_uri_mismatch") return new Error(`Google rejected this website address. Add ${typeof window === "undefined" ? "this site's origin" : window.location.origin} to the client's Authorized JavaScript origins.`);
  if (code === "invalid_request") return new Error("Google rejected the authorization request. Check the Web client configuration and this site's Authorized JavaScript origin; use the exact error shown in Google's window.");
  if (code === "invalid_scope") return new Error("Google rejected a requested permission. Check the Google project's Data Access settings.");
  return new Error("Google could not authorize access. Try again; if Google's window shows an error, use its exact error message to check the project configuration.");
}
function popupError(type?: string) {
  if (type === "popup_closed") return new Error("Google sign-in was closed. Tap Connect again when you are ready.");
  if (type === "popup_failed_to_open") return new Error("Google sign-in could not open. Allow pop-ups for RouteHours, or open the app in your phone's main browser and try again.");
  return new Error("Google sign-in did not finish. Try connecting again in your phone's main browser.");
}
function hasScopes(google: GoogleOAuth, response: GoogleTokenResponse, scopes: string[]) {
  if (google.hasGrantedAllScopes) return google.hasGrantedAllScopes(response, scopes[0], ...scopes.slice(1));
  const granted = new Set(response.scope?.split(/\s+/) || []);
  return scopes.every(scope => granted.has(scope) || scope === GOOGLE_EMAIL_SCOPE && granted.has("email"));
}

/** Call directly from a click handler. Waiting for scripts before requesting a popup loses the user gesture. */
export function requestGoogleToken(clientId: string, scopes: string | string[], options: { signal?: AbortSignal; timeoutMs?: number; prompt?: string } = {}): Promise<GoogleToken> {
  return new Promise((resolve, reject) => {
    const id = normalizeGoogleClientId(clientId), google = oauth();
    if (!validGoogleClientId(id)) { reject(new Error("Add and save a Google Web application client ID in Settings first. You can paste the client ID or its downloaded Web client JSON.")); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { reject(new Error("You are offline. Connect to the internet before signing in to Google.")); return; }
    if (!googleAuthReady() || !google) { reject(new Error("Google sign-in has not loaded. Check your connection, then reload RouteHours and tap Connect again. A browser blocker may be preventing accounts.google.com from loading.")); return; }
    if (options.signal?.aborted) { reject(new Error("Google connection cancelled.")); return; }
    if (requestPending) { reject(new Error("A Google sign-in is already open. Finish or close that window before connecting again.")); return; }
    const requested = Array.from(new Set((typeof scopes === "string" ? scopes.split(/\s+/) : scopes).filter(Boolean)));
    if (!requested.length) { reject(new Error("No Google permission was requested.")); return; }
    let settled = false;
    requestPending = true;
    const finish = (error?: Error, token?: GoogleToken) => {
      if (settled) return;
      settled = true; requestPending = false; clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(token!);
    };
    const abort = () => finish(new Error("Google connection cancelled. Close any Google sign-in window before trying again."));
    const timer = setTimeout(() => finish(new Error("Google sign-in timed out. Close the Google window, then tap Connect again. If Google displays an error, check that exact message in its project settings.")), options.timeoutMs ?? 120000);
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const client = google.initTokenClient({
        client_id: id, scope: requested.join(" "), include_granted_scopes: false,
        callback: response => {
          if (settled) return;
          if (response.error || !response.access_token) { finish(authorizationError(response.error)); return; }
          try {
            if (!hasScopes(google, response, requested)) { finish(new Error("The required Google permissions were not granted. Connect again and approve the permissions for this action.")); return; }
            const seconds = Number(response.expires_in);
            if (response.expires_in !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) { finish(new Error("Google returned an expired or invalid session. Connect again before continuing.")); return; }
            // Legacy/mocked providers can omit expiry; keep a conservative fallback.
            const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 45 * 60000;
            finish(undefined, { token: response.access_token, expires: Date.now() + Math.max(0, lifetime - 30000) });
          } catch { finish(new Error("Google's permission response could not be checked. Connect again before continuing.")); }
        },
        error_callback: error => finish(popupError(error.type)),
      });
      client.requestAccessToken({ prompt: options.prompt ?? "select_account" });
    } catch { finish(new Error("Google sign-in could not start. Check the Web client ID, allow pop-ups, and try again.")); }
  });
}

export async function readGoogleEmail(token: string): Promise<string> {
  let response: Response;
  try { response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("Could not reach Google to identify your account. Check your connection and try again."); }
  if (response.status === 401) throw new Error("Your Google session expired. Connect again.");
  if (response.status === 403) throw new Error("Google did not allow email-address access. Connect again and approve account email access.");
  const account = await response.json().catch(() => null);
  if (!response.ok || typeof account?.email !== "string" || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(account.email)) throw new Error("Google did not return a valid account email address. Connect again and allow email-address access.");
  return account.email;
}
export async function googleAccount(clientId: string): Promise<GoogleAccount> {
  const grant = await requestGoogleToken(clientId, GOOGLE_EMAIL_SCOPE);
  return { ...grant, email: await readGoogleEmail(grant.token) };
}
