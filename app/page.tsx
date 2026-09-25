"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownToLine, ArrowRight, CalendarDays, Check, ChevronDown, Clock3, FileSpreadsheet, LockKeyhole, Mic, MicOff, Pause, Pencil, Play, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { durationLabel, localDateKey, minutesBetween, shiftsCsv, thisWeekStart, type ActiveShift, type Shift } from "@/lib/time";
import { createGoogleSheet } from "@/lib/sheets";
import { interpretVoice } from "@/lib/voice";

const STORAGE_KEY = "routehours:v1";
type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type VoiceAction = { kind: "start" | "stop"; transcript: string };
type GoogleTokenClient = { requestAccessToken: () => void };
type GoogleWindow = Window & { google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }) => GoogleTokenClient } } } };
type StoredData = { shifts: Shift[]; active: ActiveShift | null; aiEnabled: boolean; accessCode: string };

function readStored(): StoredData {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      shifts: Array.isArray(value?.shifts) ? value.shifts.filter((s: Shift) => s && s.id && s.start && s.end) : [],
      active: value?.active?.start ? value.active : null,
      aiEnabled: value?.aiEnabled === true,
      accessCode: typeof value?.accessCode === "string" ? value.accessCode : "",
    };
  } catch { return { shifts: [], active: null, aiEnabled: false, accessCode: "" }; }
}

function formatTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatDay(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function emptyShift(): Shift {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60000);
  return { id: crypto.randomUUID(), start: start.toISOString(), end: end.toISOString(), notes: [] };
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [active, setActive] = useState<ActiveShift | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const [noteInput, setNoteInput] = useState("");
  const [editing, setEditing] = useState<Shift | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [modalError, setModalError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const importing = useRef<HTMLInputElement>(null);
  const processing = useRef(new Set<string>());
  const recognition = useRef<Recognition | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceAction, setVoiceAction] = useState<VoiceAction | null>(null);
  const [voiceText, setVoiceText] = useState("");

  useEffect(() => {
    const saved = readStored();
    setShifts(saved.shifts); setActive(saved.active); setAiEnabled(saved.aiEnabled); setAccessCode(saved.accessCode); setLoaded(true);
    const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ shifts, active, aiEnabled, accessCode })); }
    catch { setNotice("Browser storage is unavailable. Export your hours before closing this page."); }
  }, [loaded, shifts, active, aiEnabled, accessCode]);

  useEffect(() => {
    if (!loaded || !aiEnabled || !accessCode) return;
    for (const shift of shifts) {
      if (shift.summaryStatus !== "pending" || processing.current.has(shift.id)) continue;
      processing.current.add(shift.id);
      void fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-access-token": accessCode },
        body: JSON.stringify({ start: shift.start, end: shift.end, notes: shift.notes }),
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Summary unavailable");
        setShifts(current => current.map(item => item.id === shift.id && item.start === shift.start && item.end === shift.end && JSON.stringify(item.notes) === JSON.stringify(shift.notes) ? { ...item, summary: result.summary, summaryStatus: "done" } : item));
      }).catch(error => {
        setShifts(current => current.map(item => item.id === shift.id ? { ...item, summaryStatus: "error" } : item));
        setNotice(error instanceof Error ? error.message : "Summary unavailable");
      }).finally(() => processing.current.delete(shift.id));
    }
  }, [loaded, aiEnabled, accessCode, shifts]);

  const sorted = useMemo(() => shifts.slice().sort((a, b) => b.start.localeCompare(a.start)), [shifts]);
  const weekStart = thisWeekStart(new Date(now)).getTime();
  const weekShifts = shifts.filter(s => new Date(s.start).getTime() >= weekStart);
  const weekMinutes = weekShifts.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  const monthKey = localDateKey(new Date(now).toISOString()).slice(0, 7);
  const monthMinutes = shifts.filter(s => localDateKey(s.start).startsWith(monthKey)).reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  const activeSeconds = active ? Math.max(0, Math.floor((now - new Date(active.start).getTime()) / 1000)) : 0;
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(thisWeekStart(new Date(now)));
    date.setDate(date.getDate() + i);
    const minutes = shifts.filter(s => localDateKey(s.start) === localDateKey(date.toISOString())).reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
    return { label: ["M", "T", "W", "T", "F", "S", "S"][i], minutes, today: localDateKey(date.toISOString()) === localDateKey(new Date(now).toISOString()) };
  });
  const maxDaily = Math.max(180, ...weekDays.map(d => d.minutes));

  function startShift() {
    setActive({ start: new Date().toISOString(), notes: [] });
    setNoteInput("");
    setNotice("Shift started. Your timer will keep its place if you close this tab.");
  }
  function stopShift() {
    if (!active) return;
    const end = new Date().toISOString();
    const notes = noteInput.trim() ? [...active.notes, noteInput.trim()] : active.notes;
    const shift: Shift = { id: crypto.randomUUID(), start: active.start, end, notes, summaryStatus: aiEnabled && accessCode ? "pending" : undefined };
    setShifts(current => [shift, ...current]);
    setActive(null); setNoteInput(""); setExpanded(shift.id);
    setNotice("Shift saved. You can edit its times and notes below.");
  }
  function addNote() {
    const note = noteInput.trim();
    if (!note || !active) return;
    setActive({ ...active, notes: [...active.notes, note] });
    setNoteInput("");
  }
  function startListening() {
    const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) { setNotice("Voice input is unavailable in this browser. You can still type notes and use the timer."); return; }
    setVoiceAction(null); setVoiceText("");
    const instance = new Speech();
    instance.lang = "en-US"; instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      setVoiceText(transcript);
      const intent = interpretVoice(transcript);
      if (intent.kind === "start" || intent.kind === "stop") setVoiceAction({ kind: intent.kind, transcript });
      else if (intent.kind === "logHours") {
        const hours = intent.hours;
        if (hours > 0 && hours <= 24) {
          const end = new Date();
          const start = new Date(end.getTime() - hours * 3600000);
          const draft: Shift = { id: crypto.randomUUID(), start: start.toISOString(), end: end.toISOString(), notes: [] };
          openEdit(draft);
          setModalError("Review the suggested times before saving. The app only heard a duration, so it assumed the shift ended now.");
        } else setNotice("Say a duration between 0 and 24 hours.");
      } else if (intent.kind === "note" && active) {
        setNoteInput(intent.text);
        setNotice("Voice note captured. Review it, then tap Add note or Stop & save shift.");
      } else setNotice("Start a shift first to dictate a note, or say ‘log 2 hours’ for a manual entry.");
    };
    instance.onerror = () => { setListening(false); setNotice("Could not capture speech. Check microphone permission and try again."); };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try { instance.start(); setListening(true); } catch { setListening(false); setNotice("Microphone could not start."); }
  }
  function confirmVoiceAction() {
    if (!voiceAction) return;
    if (voiceAction.kind === "start") { if (!active) startShift(); else setNotice("A shift is already running."); }
    else { if (active) stopShift(); else setNotice("There is no active shift to stop."); }
    setVoiceAction(null);
  }
  function openEdit(shift?: Shift) {
    const value = shift || emptyShift();
    setEditing(value); setEditStart(localInput(value.start)); setEditEnd(localInput(value.end)); setEditNotes(value.notes.join("\n")); setModalError("");
  }
  function saveEdit() {
    if (!editing) return;
    const start = new Date(editStart); const end = new Date(editEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setModalError("End time must be later than start time."); return; }
    const updated: Shift = { ...editing, start: start.toISOString(), end: end.toISOString(), notes: editNotes.split("\n").map(s => s.trim()).filter(Boolean), summary: undefined, summaryStatus: undefined };
    setShifts(current => current.some(s => s.id === editing.id) ? current.map(s => s.id === editing.id ? updated : s) : [updated, ...current]);
    setEditing(null); setNotice("Shift saved. Generate the summary again if details changed.");
  }
  function retrySummary(shift: Shift) {
    if (!accessCode || !aiEnabled) { setSettingsOpen(true); return; }
    setShifts(current => current.map(s => s.id === shift.id ? { ...s, summaryStatus: "pending" } : s));
  }
  function deleteShift(id: string) {
    if (!window.confirm("Delete this shift? This cannot be undone unless you have a backup.")) return;
    setShifts(current => current.filter(s => s.id !== id));
  }
  function exportCsv(detailed: boolean) {
    if (!shifts.length) return;
    download(`routehours-${monthKey}${detailed ? "-detailed" : "-hours"}.csv`, shiftsCsv(shifts, detailed), "text/csv;charset=utf-8");
    setExportOpen(false);
  }
  function exportGoogleSheet() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const google = (window as GoogleWindow).google;
    if (!clientId) { setNotice("Google Sheets is not configured yet. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to the server, or use CSV export."); return; }
    if (!google?.accounts?.oauth2) { setNotice("Google sign-in is still loading. Try again in a moment."); return; }
    setExportOpen(false); setSheetUrl("");
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: async response => {
        if (!response.access_token) { setNotice(response.error || "Google access was not granted."); return; }
        setCreatingSheet(true);
        try { const result = await createGoogleSheet(response.access_token, shifts); setSheetUrl(result.url); setNotice(result.complete ? "Google Sheet created. Open it from the link below." : "The Google Sheet was created, but the hours could not be added. Open it below and try the CSV export."); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Could not create Google Sheet."); }
        finally { setCreatingSheet(false); }
      },
    });
    client.requestAccessToken();
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.shifts) || data.shifts.some((s: Shift) => !s.id || !s.start || !s.end)) throw new Error("Invalid backup");
      if (!window.confirm(`Replace your current history with ${data.shifts.length} shifts from this backup?`)) return;
      setShifts(data.shifts); setActive(data.active?.start ? data.active : null);
      setNotice("Backup restored.");
    } catch { setNotice("This file is not a valid RouteHours backup."); }
    if (importing.current) importing.current.value = "";
  }

  if (!loaded) return <div className="loading-screen"><div className="loading-orb"/><span>RouteHours</span></div>;

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar container">
      <div className="brand"><div className="brand-mark"><Activity size={22} strokeWidth={2.6}/></div><div><strong>RouteHours</strong><span>Bus shift tracker</span></div></div>
      <div className="top-actions"><span className="today-pill"><CalendarDays size={15}/>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(now))}</span><button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button></div>
    </header>

    <main className="container main-grid">
      <section className="hero"><div className="eyebrow"><span className="eyebrow-line"/> YOUR WORK, CLEARLY COUNTED</div><h1>Every minute<br/><em>matters.</em></h1><p>A simple place to track your time on the bus, keep useful notes, and leave with a clear record of each shift.</p></section>

      <section className={`timer-card ${active ? "is-active" : ""}`} aria-label="Shift timer">
        <div className="timer-card-top"><span className="card-kicker"><span className="status-dot"/>{active ? "SHIFT IN PROGRESS" : "READY WHEN YOU ARE"}</span><Clock3 size={20}/></div>
        <div className="timer-center"><span className="timer-caption">{active ? "Current shift" : "Your next shift"}</span><div className="timer-digits" aria-live="off">{active ? clock(activeSeconds) : "00:00:00"}</div><span className="timer-sub">{active ? `Started at ${formatTime(active.start)}` : "Tap start when you get on the bus"}</span></div>
        <button className={`timer-button ${active ? "stop" : "start"}`} onClick={active ? stopShift : startShift}>{active ? <><Pause size={20} fill="currentColor"/> Stop & save shift</> : <><Play size={20} fill="currentColor"/> Start shift</>}</button>
        <div className="timer-foot"><ShieldCheck size={15}/>Timer uses actual start and end times, even if you close the tab.</div>
      </section>

      <section className="voice-strip"><div className="voice-icon"><Mic size={22}/></div><div className="voice-copy"><strong>Speak it. Keep moving.</strong><span>Say “start shift”, “stop shift”, “add note…”, or “log 2 hours”. Browser speech service may process your voice; avoid identifying details.</span></div><button className={`voice-button ${listening ? "listening" : ""}`} onClick={listening ? () => { recognition.current?.stop(); setListening(false); } : startListening}>{listening ? <><MicOff size={17}/> Stop listening</> : <><Mic size={17}/> {voiceSupported ? "Talk to RouteHours" : "Try voice input"}</>}</button></section>
      {voiceAction && <div className="voice-confirm"><div><strong>Heard: “{voiceAction.transcript}”</strong><span>Confirm before the timer changes.</span></div><button onClick={confirmVoiceAction}>Confirm {voiceAction.kind}</button><button className="voice-cancel" onClick={() => setVoiceAction(null)} aria-label="Cancel voice command"><X size={17}/></button></div>}
      {voiceText && !voiceAction && <div className="voice-transcript">Last heard: “{voiceText}”</div>}

      <div className="stats-row">
        <div className="stat-card"><span className="stat-icon mint"><Clock3 size={19}/></span><span className="stat-label">THIS WEEK</span><strong>{durationLabel(weekMinutes)}</strong><small>{weekShifts.length} {weekShifts.length === 1 ? "shift" : "shifts"} logged</small></div>
        <div className="stat-card"><span className="stat-icon peach"><CalendarDays size={19}/></span><span className="stat-label">THIS MONTH</span><strong>{durationLabel(monthMinutes)}</strong><small>{shifts.filter(s => localDateKey(s.start).startsWith(monthKey)).length} shifts logged</small></div>
        <div className="stat-card chart-card"><div className="chart-head"><span className="stat-label">YOUR WEEK AT A GLANCE</span><span>Mon–Sun</span></div><div className="bar-chart">{weekDays.map((day, i) => <div className="bar-col" key={i} title={`${day.minutes} minutes`}><div className="bar-track"><div className={`bar-fill ${day.today ? "today" : ""}`} style={{ height: `${Math.max(day.minutes ? 8 : 3, day.minutes / maxDaily * 100)}%` }}/></div><span>{day.label}</span></div>)}</div></div>
      </div>

      {active && <section className="notes-card surface"><div className="section-heading"><div><span className="small-kicker">ON THE ROUTE</span><h2>Quick notes</h2></div><span className="live-badge"><span/> Live shift</span></div><p>Jot down practical details while they are fresh. Avoid children’s names, diagnoses, and identifying information.</p><div className="note-compose"><textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Example: Route ran 10 minutes late; helped everyone get seated safely." maxLength={2000}/><button onClick={addNote} disabled={!noteInput.trim()}><Plus size={18}/> Add note</button></div>{active.notes.length > 0 && <div className="note-list">{active.notes.map((note, i) => <div className="note-item" key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{note}</p><button aria-label="Remove note" onClick={() => setActive({ ...active, notes: active.notes.filter((_, n) => n !== i) })}><X size={15}/></button></div>)}</div>}</section>}

      <section className="history-section surface"><div className="section-heading history-heading"><div><span className="small-kicker">YOUR RECORD</span><h2>Shift history</h2></div><div className="history-actions"><button className="secondary-btn" onClick={() => openEdit()}><Plus size={17}/> Add manually</button><div className="export-wrap"><button className="primary-outline" disabled={!shifts.length || creatingSheet} onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={17}/> {creatingSheet ? "Creating…" : "Export"} <ChevronDown size={15}/></button>{exportOpen && <div className="export-menu"><button onClick={exportGoogleSheet}><FileSpreadsheet size={18}/><span><strong>Create Google Sheet</strong><small>Save hours directly to your Drive</small></span></button><button onClick={() => exportCsv(false)}><FileSpreadsheet size={18}/><span><strong>Download hours CSV</strong><small>Import into Google Sheets anytime</small></span></button><button onClick={() => exportCsv(true)}><FileSpreadsheet size={18}/><span><strong>Detailed log CSV</strong><small>Includes notes and AI summaries</small></span></button><button onClick={() => { download("routehours-backup.json", JSON.stringify({ shifts, active }, null, 2), "application/json"); setExportOpen(false); }}><ArrowDownToLine size={18}/><span><strong>Backup data</strong><small>Save a copy you can restore later</small></span></button></div>}</div></div></div>
        {sorted.length === 0 ? <div className="empty-state"><div className="empty-illustration"><Clock3 size={32}/></div><h3>Your shifts will show up here</h3><p>Start the timer for your next bus ride, or add a past shift manually.</p></div> : <div className="shift-list">{sorted.map(shift => { const open = expanded === shift.id; return <div className={`shift-item ${open ? "expanded" : ""}`} key={shift.id}><button className="shift-summary" onClick={() => setExpanded(open ? null : shift.id)} aria-expanded={open}><span className="shift-date-icon"><CalendarDays size={18}/></span><span className="shift-main"><strong>{formatDay(shift.start)}</strong><small>{formatTime(shift.start)} <ArrowRight size={13}/> {formatTime(shift.end)}</small></span><span className="shift-duration">{durationLabel(minutesBetween(shift.start, shift.end))}</span><ChevronDown className="shift-chevron" size={18}/></button>{open && <div className="shift-detail"><div className="detail-grid"><div><span className="detail-label">STARTED</span><strong>{new Date(shift.start).toLocaleString("en-GB")}</strong></div><div><span className="detail-label">FINISHED</span><strong>{new Date(shift.end).toLocaleString("en-GB")}</strong></div><div><span className="detail-label">DECIMAL HOURS</span><strong>{(minutesBetween(shift.start, shift.end) / 60).toFixed(2)} h</strong></div></div><div className="detail-notes"><span className="detail-label">YOUR NOTES</span>{shift.notes.length ? shift.notes.map((note, i) => <p key={i}>• {note}</p>) : <p className="muted">No notes recorded.</p>}</div>{shift.summaryStatus === "pending" && <div className="ai-panel"><Sparkles size={18}/><span>Creating your summary…</span><span className="mini-spinner"/></div>}{shift.summary && <div className="summary-panel"><div className="summary-title"><Sparkles size={17}/> AI SHIFT SUMMARY</div><p>{shift.summary.overview}</p>{([ ["Activities", shift.summary.activities], ["Notable moments", shift.summary.notable], ["Follow-up", shift.summary.followUp] ] as const).map(([title, values]) => values.length > 0 && <div className="summary-group" key={title}><strong>{title}</strong><ul>{values.map((value, i) => <li key={i}>{value}</li>)}</ul></div>)}</div>}{(!shift.summary || shift.summaryStatus === "error") && <button className="text-action" onClick={() => retrySummary(shift)}><Sparkles size={16}/>{shift.summaryStatus === "error" ? "Retry AI summary" : "Generate AI summary"}</button>}<div className="shift-controls"><button onClick={() => openEdit(shift)}><Pencil size={15}/> Edit shift</button><button className="danger" onClick={() => deleteShift(shift.id)}><Trash2 size={15}/> Delete</button></div></div>}</div>; })}</div>}
      </section>
      {sheetUrl && <div className="sheet-success"><FileSpreadsheet size={20}/><span>Your Google Sheet is ready.</span><a href={sheetUrl} target="_blank" rel="noopener noreferrer">Open Google Sheet <ArrowRight size={15}/></a></div>}
      <footer className="footer"><div><span className="brand-mini">RH</span> RouteHours</div><span>Your data stays in this browser until you export or back it up.</span></footer>
    </main>

    {notice && <div className="toast" role="status"><Check size={17}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15}/></button></div>}

    {editing && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Edit shift"><div className="modal-head"><div><span className="small-kicker">SHIFT DETAILS</span><h2>{shifts.some(s => s.id === editing.id) ? "Edit shift" : "Add a shift"}</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setEditing(null)}><X size={19}/></button></div><label>Start date & time<input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)}/></label><label>End date & time<input type="datetime-local" value={editEnd} onChange={e => setEditEnd(e.target.value)}/></label><label>Notes <small>One note per line. Avoid identifying children.</small><textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={5}/></label>{modalError && <p className="form-error">{modalError}</p>}<button className="modal-submit" onClick={saveEdit}>Save shift <ArrowRight size={17}/></button></div></div>}

    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings"><div className="modal-head"><div><span className="small-kicker">PREFERENCES</span><h2>Settings</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setSettingsOpen(false)}><X size={19}/></button></div><div className="setting-block"><div className="setting-title"><span className="setting-icon"><Sparkles size={19}/></span><div><strong>Automatic AI summaries</strong><p>Create a sectioned summary after each shift.</p></div><button className={`toggle ${aiEnabled ? "on" : ""}`} role="switch" aria-checked={aiEnabled} aria-label="Automatic AI summaries" onClick={() => setAiEnabled(!aiEnabled)}><span/></button></div><label className="access-label">App access code<input type="password" value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Enter the code set on your server" autoComplete="off"/></label><p className="privacy-note"><LockKeyhole size={16}/>When enabled, shift times and notes are sent to Gemini through your server. Use only de-identified notes and follow your employer’s rules for work information.</p></div><div className="setting-block"><div className="setting-title"><span className="setting-icon"><RotateCcw size={19}/></span><div><strong>Restore a backup</strong><p>Replace this browser’s history from a RouteHours JSON file.</p></div></div><input ref={importing} type="file" accept="application/json,.json" className="sr-only" onChange={e => void importBackup(e.target.files?.[0])}/><button className="secondary-btn restore-btn" onClick={() => importing.current?.click()}>Choose backup file <ArrowRight size={16}/></button></div></div></div>}
  </div>;
}
