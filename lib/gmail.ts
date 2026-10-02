import { GOOGLE_EMAIL_SCOPE, authorizeGoogleAccount, type GoogleAccount } from "./google-auth.ts";

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

export async function gmailToken(clientId: string, options: {forceAccountChoice?:boolean;signal?:AbortSignal} = {}): Promise<GoogleAccount> {
  try {
    return await authorizeGoogleAccount(clientId,'gmail',[GMAIL_SCOPE, GOOGLE_EMAIL_SCOPE],options);
  } catch (error) { throw new Error(`${error instanceof Error ? error.message : "Google could not authorize Gmail."} Nothing was sent.`); }
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
    if (response.status === 401) throw new Error("Your Gmail session expired or was revoked. Connect Gmail again before sending. Nothing was sent.");
    if (response.status === 403) throw new Error("Gmail did not authorize sending. Enable Gmail API, allow the gmail.send permission, and add your Google account as a test user if needed. Nothing was sent.");
    throw new Error(`Gmail rejected this message (${response.status}). ${text || "Try again later."}`);
  }
  if (typeof data?.id !== "string") throw new Error("Gmail returned no message confirmation. Check Sent before trying again.");
  return data.id;
}
