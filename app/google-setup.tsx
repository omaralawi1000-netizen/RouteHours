"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, Mail } from "lucide-react";
import { normalizeGoogleClientId, validGoogleClientId } from "@/lib/google-auth";

type Props = {
  clientId: string;
  onChange: (value: string) => void;
  onSave: () => void;
  connectedEmail: string;
  rememberedEmail: string;
  onConnect: (changeAccount?: boolean) => void;
  connecting: boolean;
  online: boolean;
  error: string;
};

const clientsUrl = "https://console.cloud.google.com/auth/clients";
const audienceUrl = "https://console.cloud.google.com/auth/audience";
const scopesUrl = "https://console.cloud.google.com/auth/scopes";

export default function GoogleSetup({ clientId, onChange, onSave, connectedEmail, rememberedEmail, onConnect, connecting, online, error }: Props) {
  const [origin, setOrigin] = useState("https://route-hours.vercel.app");
  const [copyStatus, setCopyStatus] = useState("");
  const normalized = normalizeGoogleClientId(clientId);
  const valid = validGoogleClientId(normalized);
  const invalid = Boolean(clientId.trim()) && !valid;
  useEffect(() => { setOrigin(window.location.origin); }, []);

  async function copyOrigin() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(origin);
      setCopyStatus("Website address copied. Paste it into Authorized JavaScript origins.");
    } catch { setCopyStatus("Automatic copying is unavailable. Select the website address above and copy it manually."); }
  }

  return <div className="setting-block google-settings">
    <div className="setting-title">
      <span className="setting-icon"><Mail size={19}/></span>
      <div><strong>Google account</strong><p>Connect your account for Sheets and email.</p></div>
    </div>

    <label className="access-label" htmlFor="google-client-id">Google Web client ID
      <small>Paste the client ID or downloaded Web client JSON from <a href={clientsUrl} target="_blank" rel="noopener noreferrer">Google Cloud Clients</a>. The client secret is not needed.</small>
      <input id="google-client-id" type="text" value={clientId} onChange={event => onChange(event.target.value)} placeholder="…apps.googleusercontent.com" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby={clientId.trim() ? "google-id-status" : undefined}/>
    </label>
    {clientId.trim() && <p id="google-id-status" className={`id-status ${valid ? "valid" : "invalid"}`}>{valid ? "Client ID format looks right. Save it, then connect." : "Use a Web application client ID ending in .apps.googleusercontent.com, or its downloaded JSON."}</p>}
    <button type="button" className="google-save" disabled={connecting} onClick={onSave}><Check size={16}/> Save Google client ID</button>
    <button type="button" className="modal-submit" disabled={connecting || !online || invalid} onClick={() => onConnect(Boolean(connectedEmail))}>{connecting ? "Connecting…" : connectedEmail ? "Change Google account" : rememberedEmail ? "Continue with Google" : "Connect Google"}<Mail size={17}/></button>
    {!connectedEmail && rememberedEmail && <><p className="origin-help">Saved account: {rememberedEmail}. Your client ID is saved; Google access may need renewing.</p><button className="text-action" disabled={connecting || !online} onClick={() => onConnect(true)}>Use another account</button></>}
    {!online && <p className="origin-help">Connect to the internet to sign in to Google. Your timer and typed notes still work offline.</p>}
    {connectedEmail && <p className="connection-result success">Account: {connectedEmail}. Sheets and email permissions are requested when you use those actions.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    <details className="advanced-ai google-origin-help">
      <summary>Fix “Access blocked · origin_mismatch”</summary>
      <p className="origin-help">Google needs this website registered on the same Web client ID you saved above.</p>
      <ol className="google-setup-steps">
        <li>Open <a href={clientsUrl} target="_blank" rel="noopener noreferrer">Google Cloud Clients</a> and select the project that owns your saved client ID.</li>
        <li>Select that <strong>Web application</strong> client.</li>
        <li>Under <strong>Authorized JavaScript origins</strong>, add this exact address:</li>
      </ol>
      <div className="google-origin-row"><code>{origin}</code><button type="button" className="secondary-btn" onClick={() => void copyOrigin()}><Clipboard size={16}/> Copy address</button></div>
      {copyStatus && <p className="origin-help" role="status">{copyStatus}</p>}
      <p className="origin-help">Use the origin only, with no trailing slash or page path. Add it to JavaScript origins, not redirect URIs.</p>
      <p className="origin-help">Save in Google Cloud, return here and tap <strong>Connect Google</strong> again. If it still shows the same error, allow a little time for Google's change to take effect and retry.</p>
    </details>

    <details className="advanced-ai google-api-help">
      <summary>Sheets & Gmail permissions</summary>
      <p>Use the same Google Cloud project as your Web client ID.</p>
      <ul className="google-setup-steps">
        <li>Enable <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener noreferrer">Google Sheets API</a> and <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Google Drive API</a> to export and share a Sheet.</li>
        <li>Enable <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">Gmail API</a> to email the Excel attachment.</li>
        <li>In <a href={scopesUrl} target="_blank" rel="noopener noreferrer">Data Access</a>, add these scopes for the features you use: <code>https://www.googleapis.com/auth/userinfo.email</code>, <code>https://www.googleapis.com/auth/drive.file</code> and <code>https://www.googleapis.com/auth/gmail.send</code>.</li>
        <li>If your app is in testing, add your Google account under <strong>Test users</strong> in <a href={audienceUrl} target="_blank" rel="noopener noreferrer">Audience</a>.</li>
      </ul>
      <p className="origin-help">Connecting here confirms your account. Gmail asks for its own permission the first time; the sender stays visible before you send.</p>
    </details>
  </div>;
}
