export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export function validRecipient(value: string) { return /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value.trim()) && !/[\r\n]/.test(value); }
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function encoded(text: string) { return base64(new TextEncoder().encode(text)); }
function folded(text: string) { return text.match(/.{1,76}/g)?.join("\r\n") || ""; }
function subjectHeader(text: string) {
  const words: string[] = []; let part = "";
  for (const character of text) {
    if (new TextEncoder().encode(part + character).length > 42) { words.push(`=?UTF-8?B?${encoded(part)}?=`); part = ""; }
    part += character;
  }
  if (part) words.push(`=?UTF-8?B?${encoded(part)}?=`);
  return words.join("\r\n ");
}

export async function gmailMessage(to: string, subject: string, message: string, file: File, from?: string) {
  if (!validRecipient(to)) throw new Error("Enter one valid recipient email address.");
  if (!subject.trim() || /[\r\n]/.test(subject)) throw new Error("Enter a subject on one line.");
  if (from && !validRecipient(from)) throw new Error("The signed-in Google account has no valid email address.");
  const boundary = `routehours_${crypto.randomUUID().replaceAll("-", "")}`;
  const filename = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const mime = [
    ...(from ? [`From: ${from}`] : []), `To: ${to.trim()}`, `Subject: ${subjectHeader(subject)}`, "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", folded(encoded(message)), "",
    `--${boundary}`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", folded(base64(new Uint8Array(await file.arrayBuffer()))), "",
    `--${boundary}--`, "",
  ].join("\r\n");
  return encoded(mime).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function gmailToken(clientId: string): Promise<{ token: string; email: string }> {
  return new Promise((resolve, reject) => {
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) { reject(new Error("Add your Google OAuth client ID in Settings first. Gmail uses the same Web client ID as Sheets.")); return; }
    type Google = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; include_granted_scopes: boolean; callback: (response: { access_token?: string; error?: string }) => void; error_callback: (error: { type?: string }) => void }) => { requestAccessToken: (options: { prompt: string }) => void } } } };
    const google = (window as Window & { google?: Google }).google;
    if (!google?.accounts?.oauth2) { reject(new Error("Google sign-in is still loading. Check your connection and try again.")); return; }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: `${GMAIL_SCOPE} https://www.googleapis.com/auth/userinfo.email`, include_granted_scopes: false,
      callback: response => {
        if (!response.access_token) { reject(new Error(response.error === "access_denied" ? "Gmail permission was not granted. Nothing was sent." : "Google could not authorize Gmail. Nothing was sent.")); return; }
        const token = response.access_token;
        void fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).then(async result => {
          const account = await result.json();
          if (!result.ok || typeof account.email !== "string" || !validRecipient(account.email)) throw new Error("Could not identify your Google email address. Nothing was sent.");
          resolve({ token, email: account.email });
        }).catch(() => reject(new Error("Could not identify your Google email address. Allow email-address access when signing in. Nothing was sent.")));
      },
      error_callback: error => reject(new Error(error.type === "popup_closed" ? "Google sign-in was closed. Nothing was sent." : "Google sign-in could not open. Allow pop-ups for RouteHours and try again.")),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

export async function sendGmailMessage(token: string, raw: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }), signal: AbortSignal.timeout(30000),
    });
  } catch { throw new Error("Could not confirm delivery. Check Gmail’s Sent folder before trying again to avoid sending twice."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const text = String(data?.error?.message || "");
    if (/disabled|not been used|SERVICE_DISABLED|accessNotConfigured/i.test(text) || data?.error?.details?.some((d: { reason?: string }) => d.reason === "SERVICE_DISABLED")) throw new Error("Enable the Gmail API in the Google Cloud project that owns your client ID, then try again. Nothing was sent.");
    if (response.status === 401 || response.status === 403) throw new Error("Gmail did not authorize sending. Enable Gmail API, allow the gmail.send permission, and add your Google account as a test user if needed. Nothing was sent.");
    throw new Error(`Gmail rejected this message (${response.status}). ${text || "Try again later."}`);
  }
  if (typeof data?.id !== "string") throw new Error("Gmail returned no message confirmation. Check Sent before trying again.");
  return data.id;
}
