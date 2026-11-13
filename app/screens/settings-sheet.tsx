"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileSpreadsheet, LockKeyhole, Mic, Moon, RotateCcw, Settings2, Sparkles, Sun, X } from "lucide-react";
import { googleAccount as connectGoogleAccount, normalizeGoogleClientId, validGoogleClientId } from "@/lib/google-auth";
import { validateTemplates, type ShiftTemplate } from "@/lib/templates";
import type { DictationLanguage } from "@/lib/stored-data";
import { useAppData } from "../state/app-data";
import type { Backups } from "../features/use-backups";
import GoogleSetup from "../google-setup";
import CloudBackup from "../cloud-backup";
import { TemplateSettings } from "../shift-templates";

export type SettingsSection = "profile" | "connections" | "backups";
type Connection = { ok: boolean; message: string } | null;

type Props = {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
  online: boolean;
  effectiveClientId: string;
  google: { account: { email: string } | null; savedEmail: string };
  backups: Backups;
  onNotice: (message: string) => void;
  onGoogleSetup: () => void;
};

export default function SettingsSheet({ section, onSection, onClose, online, effectiveClientId, google, backups, onNotice, onGoogleSetup }: Props) {
  const { data, update, saveNow, saveStatus } = useAppData();
  const { payroll, themeMode, weeklyGoalHours, templates, googleClientId, aiEnabled, geminiApiKey, accessCode, groqApiKey, dictationLanguage, workZone } = data;
  const [saved, setSaved] = useState(false), [saveError, setSaveError] = useState("");
  const [googleConnecting, setGoogleConnecting] = useState(false), [googleError, setGoogleError] = useState("");
  const [checkingAi, setCheckingAi] = useState(false), [aiConnection, setAiConnection] = useState<Connection>(null);
  const [checkingGroq, setCheckingGroq] = useState(false), [groqConnection, setGroqConnection] = useState<Connection>(null);
  const importing = useRef<HTMLInputElement>(null);
  const googleAccount = google.account?.email || "";
  /** Every edit saves automatically; this only clears the "Saved" note until the button is pressed again. */
  const change = (patch: Parameters<typeof update>[0]) => { update(patch); setSaved(false); };

  async function saveSettings() {
    const normalizedId = normalizeGoogleClientId(googleClientId);
    if (normalizedId && !validGoogleClientId(normalizedId)) { setSaved(false); setSaveError("Paste a Web application client ID ending in .apps.googleusercontent.com, or its downloaded JSON."); return; }
    try { await saveNow({ googleClientId: normalizedId }); setSaved(true); setSaveError(""); }
    catch (e) { setSaved(false); setSaveError((e as Error).message); }
  }
  async function saveTemplates(value: ShiftTemplate[]) {
    await saveNow({ templates: validateTemplates(value) });
  }
  async function connectGoogle(changeAccount = false) {
    if (!online) { setGoogleError("Go online to connect Google. Your settings stay saved here."); return; }
    setGoogleConnecting(true); setGoogleError("");
    try { await connectGoogleAccount(effectiveClientId, { forceAccountChoice: changeAccount }); }
    catch (e) { setGoogleError((e as Error).message); } finally { setGoogleConnecting(false); }
  }
  async function testAiConnection() {
    if (!geminiApiKey.trim() && !accessCode.trim()) { setAiConnection({ ok: false, message: "Enter a Gemini API key first." }); return; }
    setCheckingAi(true); setAiConnection(null);
    try {
      const response = await fetch("/api/summarize", { method: "POST", headers: { "content-type": "application/json", "x-app-access-token": accessCode.trim() }, body: JSON.stringify({ apiKey: geminiApiKey.trim(), start: "2026-01-01T08:00:00.000Z", end: "2026-01-01T09:00:00.000Z", notes: ["Connection test only. No real shift data."] }) });
      const result = await response.json();
      if (!response.ok || !result.summary) throw new Error(result.error || "Gemini did not return a summary.");
      update({ aiEnabled: true }); setSaved(false);
      setAiConnection({ ok: true, message: "Gemini is connected. Automatic summaries are on." });
    } catch (error) {
      setAiConnection({ ok: false, message: error instanceof Error ? error.message : "Connection test failed. Try again online." });
    } finally { setCheckingAi(false); }
  }
  async function testGroqConnection() {
    if (!groqApiKey.trim()) { setGroqConnection({ ok: false, message: "Enter your Groq API key first." }); return; }
    setCheckingGroq(true); setGroqConnection(null);
    try {
      const response = await fetch("/api/transcribe", { headers: { "x-groq-api-key": groqApiKey.trim() } });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ready) throw new Error(result?.error || "Groq is unavailable. Try again.");
      setGroqConnection({ ok: true, message: "Groq is ready for dictation." });
    } catch (error) {
      setGroqConnection({ ok: false, message: error instanceof TypeError ? "Could not reach Groq. Check your connection." : error instanceof Error ? error.message : "Could not connect to Groq." });
    } finally { setCheckingGroq(false); }
  }

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
    <div className="modal-head"><div><h2>Settings</h2></div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={19}/></button></div>
    <div className="settings-segments" role="group" aria-label="Settings section">{([["profile", "Profile"], ["connections", "Connections"], ["backups", "Backups"]] as const).map(([value, label]) => <button key={value} type="button" id={"settings-" + value + "-button"} aria-pressed={section === value} onClick={() => { onSection(value); document.querySelector(".settings-body")?.scrollTo({ top: 0 }); }}>{label}</button>)}</div>
    <div className="settings-body">
      <div hidden={section !== "profile"} aria-labelledby="settings-profile-button">
        <div className="setting-block"><div className="setting-title"><span className="setting-icon"><FileSpreadsheet size={19}/></span><div><strong>Timesheet details</strong><p>Filled in automatically on your weekly export.</p></div></div><label>Full name<input value={payroll.name} maxLength={120} onChange={e => change({ payroll: { ...payroll, name: e.target.value } })}/></label><label>Payroll number · Løn-nr.<input value={payroll.number} maxLength={60} onChange={e => change({ payroll: { ...payroll, number: e.target.value } })}/></label><label>Employer email<input type="email" value={payroll.email} maxLength={254} onChange={e => change({ payroll: { ...payroll, email: e.target.value } })}/></label></div>
        <div className="setting-block appearance-settings"><div className="setting-title"><span className="setting-icon"><Moon size={19}/></span><div><strong>Appearance</strong><p>Pick the look that works best for you.</p></div></div><div className="theme-options" role="group" aria-label="Appearance">{([["system", "System"], ["light", "Light"], ["dark", "Dark"]] as const).map(([value, label]) => <button key={value} className={themeMode === value ? "selected" : ""} aria-pressed={themeMode === value} onClick={() => change({ themeMode: value })}>{value === "dark" ? <Moon size={15}/> : value === "light" ? <Sun size={15}/> : <Settings2 size={15}/>} {label}</button>)}</div><label className="goal-setting">Weekly hours goal <small>Optional. Only logged shifts count toward it.</small><div><input type="number" min="0" max="80" step="0.5" value={weeklyGoalHours || ""} onChange={e => change({ weeklyGoalHours: Math.max(0, Math.min(80, Number(e.target.value) || 0)) })} placeholder="No goal"/><span>hours</span></div></label></div>
        <TemplateSettings templates={templates} onSave={saveTemplates}/>
      </div>
      <div hidden={section !== "connections"} aria-labelledby="settings-connections-button">
        <div className="connection-overview"><div><span>Voice</span><strong>{groqConnection?.ok ? "Connected" : groqApiKey ? "Key saved" : "Browser dictation"}</strong></div><div><span>AI</span><strong>{aiConnection?.ok ? "Connected" : geminiApiKey || accessCode ? "Key saved" : "Not set up"}</strong></div><div><span>Google</span><strong>{googleAccount || google.savedEmail || "Not set up"}</strong></div></div>
        <GoogleSetup clientId={googleClientId} onChange={value => { change({ googleClientId: value }); setGoogleError(""); setSaveError(""); }} onSave={() => void saveSettings()} connectedEmail={googleAccount} rememberedEmail={google.savedEmail} onConnect={changeAccount => void connectGoogle(changeAccount)} connecting={googleConnecting} online={online} error={googleError}/>
        <details className="provider-disclosure"><summary>Voice & AI<ChevronDown size={17}/></summary>
          <div className="setting-block">
            <div className="setting-title"><span className="setting-icon"><Sparkles size={19}/></span><div><strong>Automatic AI summaries</strong><p>Organize your notes when you stop a shift.</p></div><button className={`toggle ${aiEnabled ? "on" : ""}`} role="switch" aria-checked={aiEnabled} aria-label="Automatic AI summaries" onClick={() => change({ aiEnabled: !aiEnabled })}><span/></button></div>
            <label className="access-label">Gemini API key <small>Get yours from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.</small><input type="password" value={geminiApiKey} onChange={e => { change({ geminiApiKey: e.target.value, aiEnabled: false }); setAiConnection(null); }} placeholder="Paste your Gemini API key" autoComplete="off" spellCheck={false}/></label>
            <div className="ai-connection-actions"><button className="modal-submit" disabled={checkingAi || !(geminiApiKey.trim() || accessCode.trim())} onClick={() => void testAiConnection()}>{checkingAi ? "Checking Gemini…" : "Test & connect Gemini"} <Sparkles size={16}/></button>{geminiApiKey && <button className="clear-key" onClick={() => { change({ geminiApiKey: "", aiEnabled: false }); setAiConnection(null); }}>Remove key</button>}</div>
            {aiConnection && <p className={`connection-result ${aiConnection.ok ? "success" : "error"}`} role="status">{aiConnection.ok ? <Check size={17}/> : <X size={17}/>} {aiConnection.message}</p>}
            <details className="advanced-ai"><summary>Using a server access code instead?</summary><label>Server access code<input type="password" value={accessCode} onChange={e => { change({ accessCode: e.target.value }); setAiConnection(null); }} placeholder="Only if configured in Vercel" autoComplete="off"/></label><p>This needs GEMINI_API_KEY and APP_ACCESS_TOKEN set on the server. A Gemini API key belongs in the field above.</p></details>
            <p className="privacy-note"><LockKeyhole size={16}/>Your key stays in this browser and is excluded from backups. RouteHours sends it through its server to Google when you test or create a summary. Use only de-identified, work-approved notes.</p>
          </div>
          <div className="setting-block">
            <div className="setting-title"><span className="setting-icon"><Mic size={19}/></span><div><strong>Voice dictation with Groq</strong><p>Fast speech to text for your notes and voice commands.</p></div></div>
            <label className="access-label">Groq API key <small>Get yours from <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq Console</a>.</small><input type="password" value={groqApiKey} onChange={e => { change({ groqApiKey: e.target.value }); setGroqConnection(null); }} placeholder="Paste your Groq API key" autoComplete="off" spellCheck={false}/></label>
            <label className="dictation-language">Dictation language<select value={dictationLanguage} onChange={e => change({ dictationLanguage: e.target.value as DictationLanguage })}><option value="auto">Detect automatically</option><option value="en">English</option><option value="da">Danish</option><option value="ar">Arabic</option></select></label>
            <div className="ai-connection-actions"><button className="modal-submit groq-test" disabled={checkingGroq || !groqApiKey.trim()} onClick={() => void testGroqConnection()}>{checkingGroq ? "Checking Groq…" : "Test Groq key"} <Mic size={16}/></button>{groqApiKey && <button className="clear-key" onClick={() => { change({ groqApiKey: "" }); setGroqConnection(null); }}>Remove key</button>}</div>
            {groqConnection && <p className={`connection-result ${groqConnection.ok ? "success" : "error"}`} role="status">{groqConnection.ok ? <Check size={17}/> : <X size={17}/>} {groqConnection.message}</p>}
            <p className="privacy-note"><LockKeyhole size={16}/>With a Groq key saved, the mic records up to one minute and sends that audio to Groq when you finish. RouteHours keeps the text, not the audio. Speak only your own notes and avoid identifying children.</p>
          </div>
        </details>
      </div>
      <div hidden={section !== "backups"} aria-labelledby="settings-backups-button">
        <CloudBackup clientId={effectiveClientId} online={online} zone={workZone} daily={{ enabled: backups.dailyEnabled, onToggle: backups.toggleDailyBackup, saving: backups.dailyBackup.saving, message: backups.dailyBackup.message, error: backups.dailyBackup.error }} onSettings={onGoogleSetup} makeBackup={backups.makeCompleteBackup} onRestore={backups.previewBackup}/>
        <div className="setting-block"><div className="setting-title"><strong>Your records</strong><span>{saveStatus}</span></div><p>Last backup downloaded: {backups.lastBackup ? new Date(backups.lastBackup).toLocaleString("en-GB") : "Not yet"}</p><button className="secondary-btn" onClick={() => void backups.exportBackup()}><Download size={17}/> Download backup</button><button className="text-action" onClick={async () => { const granted = await navigator.storage?.persist?.(); onNotice(granted ? "Persistent storage granted. Keep external backups too." : "Browser-managed storage is active. Keep an external backup."); }}>Protect device storage</button><label>Work timezone<select value={workZone} onChange={e => change({ workZone: e.target.value })}>{Array.from(new Set([workZone, "Europe/Copenhagen", "Europe/London", "Europe/Berlin", "Asia/Dubai", "America/New_York"])).map(z => <option key={z}>{z}</option>)}</select><small>Used for all displayed hours and weekly exports.</small></label></div>
        <div className="setting-block"><div className="setting-title"><span className="setting-icon"><RotateCcw size={19}/></span><div><strong>Restore a backup</strong><p>Preview a backup, then merge or replace your hours.</p></div></div><input ref={importing} type="file" accept="application/json,.json" className="sr-only" onChange={async e => { await backups.importBackup(e.target.files?.[0]); if (importing.current) importing.current.value = ""; }}/><button className="secondary-btn restore-btn" onClick={() => importing.current?.click()}>Choose backup file <ArrowRight size={16}/></button></div>
      </div>
    </div>
    <div className="settings-save-bar"><button className="modal-submit" onClick={saveSettings}><Check size={17}/> Save settings</button>{saved && <span className="settings-saved" role="status"><Check size={15}/> Saved on this device.</span>}{saveError && <span className="settings-save-error" role="alert">{saveError}</span>}</div>
  </div></div>;
}
