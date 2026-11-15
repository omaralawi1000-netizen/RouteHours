"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { m } from "motion/react";
import { Check, Download, ExternalLink, FileText, Mail, Plus, Smartphone, Upload, X } from "lucide-react";
import { normalizeGoogleClientId, validGoogleClientId, googleAccount as connectGoogleAccount } from "@/lib/google-auth";
import { clearGoogleSession } from "@/lib/google-session";
import { disconnectGoogle, rememberGoogleSecret, secretFromPaste, staysSignedIn } from "@/lib/google-offline";
import { validateTemplates, type ShiftTemplate } from "@/lib/templates";
import { shiftsCsv } from "@/lib/time";
import { useAppData } from "../state/app-data";
import type { Backups } from "../features/use-backups";
import { download } from "../features/download";
import Button from "../ui/button";
import Glass from "../ui/glass";
import Toggle from "../ui/toggle";
import Wallpaper from "../ui/wallpaper";
import { SCENES, type SceneId } from "../ui/wallpaper-scenes";
import { spring } from "../ui/motion";
import { item } from "../lab/stagger";
import { GeminiCard } from "./ai";
import Reminders from "./reminders";
import { partsFrom, SPLIT_DAY, stillDefault } from "./usual";
import styles from "./home.module.css";

type Say = (text: string) => void;
const ZONES = ["Europe/Copenhagen", "Europe/London", "Europe/Berlin", "Asia/Dubai", "America/New_York"];

export type LookPrefs = {
  choice: SceneId | "auto"; sceneName: string; onScene: (next: SceneId | "auto") => void; sceneId: SceneId;
  blur: boolean; onBlur: (on: boolean) => void; reduce: boolean; onReduce: (on: boolean) => void; haptics: boolean; onHaptics: (on: boolean) => void;
};

/** Settings: who you are, your usual shifts, reminders, AI, Google, the look, pay and your data. */
export default function Settings({ say, look, rate, onRate, travel, onTravel, backups, online, clientId, google, install }: {
  say: Say; look: LookPrefs; rate: number; onRate: (rate: number) => void; travel: number; onTravel: (minutes: number) => void;
  backups: Backups; online: boolean; clientId: string; google: { email: string; saved: string };
  install: { installed: boolean; install: () => Promise<void>; instructionsOpen: boolean };
}) {
  const { data, update, saveNow, saveStatus } = useAppData();
  const { payroll, templates, geminiApiKey, aiEnabled, weeklyGoalHours, workZone, shifts } = data;
  const parts = partsFrom(templates);
  return <>
    <m.header variants={item} className={styles.top}>
      <div><p className={styles.eyebrow}>RouteHours</p><h1 className={`${styles.title} serif`}>Settings</h1></div>
    </m.header>

    <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>You</h2><span className={styles.cardMeta}>On the timesheet</span></div>
        <div className={styles.form}>
          <label className={`${styles.field} ${styles.wide}`}><span>Name</span><input className={styles.text} value={payroll.name} onChange={e => update({ payroll: { ...payroll, name: e.target.value } })} autoComplete="name" maxLength={120}/></label>
          <label className={`${styles.field} ${styles.wide}`}><span>Employee number</span><input className={styles.text} value={payroll.number} onChange={e => update({ payroll: { ...payroll, number: e.target.value } })} inputMode="numeric" maxLength={60}/></label>
          <label className={`${styles.field} ${styles.wide}`}><span>Send timesheets to</span><input className={styles.text} type="email" value={payroll.email} onChange={e => update({ payroll: { ...payroll, email: e.target.value } })} autoComplete="off" autoCapitalize="none" placeholder="lon@company.dk" maxLength={254}/></label>
        </div>
      </Glass>
    </m.section>

    <m.section variants={item}><UsualShifts templates={templates} onSave={async value => { await saveNow({ templates: value }); say("Usual shifts saved"); }} say={say}/></m.section>
    <m.section variants={item}><Reminders say={say} travel={travel} onTravel={onTravel} parts={parts} zone={workZone}/></m.section>
    <m.section variants={item}><GeminiCard apiKey={geminiApiKey} onSave={key => update({ geminiApiKey: key })} say={say} summaries={aiEnabled} onSummaries={on => update({ aiEnabled: on })}/></m.section>
    <m.section variants={item}><GoogleCard clientId={clientId} google={google} online={online} say={say}/></m.section>

    <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Wallpaper</h2><span className={styles.cardMeta}>Warms up on shift</span></div>
        <Row label="Follow the time of day" hint={look.choice === "auto" ? `Now: ${look.sceneName}` : "Dawn, day, dusk and night"}><Toggle label="Follow the time of day" checked={look.choice === "auto"} onChange={on => look.onScene(on ? "auto" : look.sceneId)}/></Row>
        <div className={styles.picker} role="radiogroup" aria-label="Wallpaper">
          {SCENES.map(option => {
            const selected = look.choice === option.id;
            return <m.button key={option.id} type="button" role="radio" aria-checked={selected} className={styles.pick} onClick={() => look.onScene(option.id)} whileTap={{ scale: 0.95 }} transition={spring.tap}>
              <span className={styles.thumb}><Wallpaper thumb scene={option.id} state="idle"/></span>
              {selected && <m.span layoutId="wallpaper-ring" className={styles.ring} transition={spring.snappy}><Check aria-hidden="true"/></m.span>}
              <span className={styles.pickName}>{option.name}</span>
            </m.button>;
          })}
        </div>
        <Row label="Live blur" hint="Off saves battery"><Toggle label="Live blur" checked={look.blur} onChange={look.onBlur}/></Row>
        <Row label="Reduce motion" hint="Fewer moving parts"><Toggle label="Reduce motion" checked={look.reduce} onChange={look.onReduce}/></Row>
        <Row label="Haptics" hint="A tick on Start, Finish and Send"><Toggle label="Haptics" checked={look.haptics} onChange={look.onHaptics}/></Row>
      </Glass>
    </m.section>

    <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Pay and goal</h2><span className={styles.cardMeta}>Estimates only</span></div>
        <div className={styles.form}>
          <label className={styles.field}><span>Pay per hour (kr)</span><NumberInput value={rate} min={0} max={2000} step={1} onChange={onRate}/></label>
          <label className={styles.field}><span>Weekly goal (h)</span><NumberInput value={weeklyGoalHours} min={0} max={80} step={0.5} onChange={value => update({ weeklyGoalHours: value })} placeholder="None"/></label>
          <label className={`${styles.field} ${styles.wide}`}><span>Work time zone</span>
            <select className={styles.text} value={workZone} onChange={e => update({ workZone: e.target.value })}>{Array.from(new Set([workZone, ...ZONES])).map(z => <option key={z} value={z}>{z.replace("_", " ")}</option>)}</select>
          </label>
        </div>
        <p className={styles.hint}>The pay shown is before tax and stays on this phone. The goal is optional.</p>
      </Glass>
    </m.section>

    <m.section variants={item}><DataCard backups={backups} saveStatus={saveStatus} csv={detailed => download(detailed ? "routehours-detailed.csv" : "routehours.csv", shiftsCsv(shifts, detailed, workZone), "text/csv")} say={say} install={install} clientId={clientId}/></m.section>

    <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>All tools</h2></div>
        <p className={styles.hint}>The old screens are still there with the same records: Google Sheets export, Groq dictation, SH and Andet fields, and the full Google setup guide.</p>
        <a className={styles.linkButton} href="/classic">Open the classic screens <ExternalLink aria-hidden="true"/></a>
      </Glass>
    </m.section>
  </>;
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <div className={styles.row}><div><p>{label}</p><p className={styles.small}>{hint}</p></div>{children}</div>;
}

/** A number field that lets you clear it while typing, and saves only valid numbers. */
function NumberInput({ value, min, max, step, onChange, placeholder }: { value: number; min: number; max: number; step: number; onChange: (value: number) => void; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : "");
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { last.current = value; setText(value ? String(value) : ""); } }, [value]);
  return <input type="number" inputMode="decimal" min={min} max={max} step={step} value={text} placeholder={placeholder} onChange={e => {
    setText(e.target.value);
    const next = e.target.value === "" ? 0 : Number(e.target.value.replace(",", "."));
    if (Number.isFinite(next)) { const clamped = Math.max(min, Math.min(max, next)); last.current = clamped; onChange(clamped); }
  }}/>;
}

function UsualShifts({ templates, onSave, say }: { templates: ShiftTemplate[]; onSave: (value: ShiftTemplate[]) => Promise<void>; say: Say }) {
  const [draft, setDraft] = useState(templates);
  const [error, setError] = useState("");
  const saved = JSON.stringify(templates);
  useEffect(() => { setDraft(JSON.parse(saved)); }, [saved]);
  const changed = JSON.stringify(draft) !== saved;
  const edit = (id: string, patch: Partial<ShiftTemplate>) => { setDraft(list => list.map(t => t.id === id ? { ...t, ...patch } : t)); setError(""); };
  async function save(value = draft) {
    try { await onSave(validateTemplates(value)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Check the times."); }
  }
  return <Glass blur className={styles.card}>
    <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Usual shifts</h2><span className={styles.cardMeta}>Quick start and reminders</span></div>
    {stillDefault(templates) && <div className={styles.suggest}>
      <p>Still the starter times. Use your split day, <span className="numeric">06:45–08:10</span> and <span className="numeric">12:25–14:45</span>?</p>
      <Button variant="primary" size="small" onClick={() => void save(SPLIT_DAY)}>Use these</Button>
    </div>}
    <ul className={styles.templates}>
      {draft.map(t => <li key={t.id} className={styles.templateRow}>
        <label className={styles.field}><span>Name</span><input className={styles.text} value={t.name} maxLength={50} onChange={e => edit(t.id, { name: e.target.value })}/></label>
        <label className={styles.field}><span>Start</span><input type="time" value={t.start} onChange={e => edit(t.id, { start: e.target.value })}/></label>
        <label className={styles.field}><span>End</span><input type="time" value={t.end} onChange={e => edit(t.id, { end: e.target.value })}/></label>
        <button type="button" className={styles.removeButton} aria-label={`Remove ${t.name || "this shift"}`} onClick={() => setDraft(list => list.filter(x => x.id !== t.id))}><X aria-hidden="true"/></button>
      </li>)}
    </ul>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.inline}>
      {draft.length < 4 && <Button variant="glass" size="small" icon={<Plus/>} onClick={() => setDraft(list => [...list, { id: crypto.randomUUID(), name: list.length ? "Evening" : "Morning", start: "17:00", end: "19:00" }])}>Add a part</Button>}
      {changed && <Button variant="primary" size="small" onClick={() => void save()}>Save</Button>}
      {changed && <Button variant="glass" size="small" onClick={() => { setDraft(JSON.parse(saved)); setError(""); say("Changes undone"); }}>Cancel</Button>}
    </div>
    <p className={styles.hint}>A split day is two parts. The chip on Today starts the next one, and Log usual day adds them all.</p>
  </Glass>;
}

function GoogleCard({ clientId, google, online, say }: { clientId: string; google: { email: string; saved: string }; online: boolean; say: Say }) {
  const { data, saveNow } = useAppData();
  const [text, setText] = useState(data.googleClientId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setLinked(Boolean(clientId) && staysSignedIn(clientId)); }, [clientId, google.email]);
  const normalized = normalizeGoogleClientId(text);
  const changed = editing || normalized !== normalizeGoogleClientId(data.googleClientId);
  async function saveId() {
    if (normalized && !validGoogleClientId(normalized)) { setError("Paste a Web client ID ending in .apps.googleusercontent.com, or its downloaded JSON."); return; }
    const secret = text.trim().startsWith("{") ? secretFromPaste(text) : "";
    if (secret) rememberGoogleSecret(normalized, secret);
    try { await saveNow({ googleClientId: normalized }); setText(normalized); setEditing(false); setError(""); say(secret ? "Client ID and secret saved. Tap Connect." : "Client ID saved"); }
    catch (e) { setError((e as Error).message); }
  }
  async function connect(change: boolean) {
    if (!online) { setError("Go online to connect Google."); return; }
    setBusy(true); setError("");
    try { const account = await connectGoogleAccount(clientId, { forceAccountChoice: change }); say(`Connected as ${account.email}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function signOut() {
    await disconnectGoogle(clientId);
    for (const service of ["google", "drive", "gmail"] as const) clearGoogleSession(clientId, service);
    setLinked(false); say("Signed out of Google on this phone");
  }
  const email = google.email || google.saved;
  return <Glass blur className={styles.card}>
    <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Google</h2><span className={styles.cardMeta}>{google.email ? "Connected" : email ? "Saved" : "Not set up"}</span></div>
    <div className={styles.reminderRow}>
      <span className={styles.reminderIcon}><Mail aria-hidden="true"/></span>
      <div className={styles.reminderText}><p>{email || "Gmail and Drive"}</p><p className={styles.hint}>{google.email ? (linked ? "Stays signed in. Sending works without a Google window." : "Connected for this hour. Add the client secret in the classic screens to stay signed in.") : email ? "Access needs renewing. Tap Continue." : "Sends the timesheet from your Gmail, and keeps a daily Drive backup."}</p></div>
    </div>
    {!clientId || changed ? <label className={`${styles.field} ${styles.wide}`}><span>Google Web client ID</span>
      <input className={styles.text} value={text} onChange={e => { setText(e.target.value); setError(""); }} placeholder="…apps.googleusercontent.com" autoComplete="off" autoCapitalize="none" spellCheck={false}/>
    </label> : null}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.inline}>
      {(changed || !clientId) && <Button variant="glass" size="small" onClick={() => void saveId()} disabled={!text.trim()}>Save client ID</Button>}
      {editing && <Button variant="glass" size="small" onClick={() => { setEditing(false); setText(data.googleClientId); setError(""); }}>Cancel</Button>}
      {clientId && !changed && <Button variant="primary" size="small" disabled={busy || !online} onClick={() => void connect(Boolean(google.email))}>{busy ? "Connecting…" : google.email ? "Change account" : email ? "Continue with Google" : "Connect Google"}</Button>}
      {clientId && !changed && !google.email && email && <Button variant="glass" size="small" disabled={busy || !online} onClick={() => void connect(true)}>Another account</Button>}
      {linked && <Button variant="glass" size="small" onClick={() => void signOut()}>Sign out</Button>}
      {clientId && !changed && <button type="button" className={styles.link} onClick={() => setEditing(true)}>Change client ID</button>}
    </div>
  </Glass>;
}

function DataCard({ backups, saveStatus, csv, say, install, clientId }: { backups: Backups; saveStatus: string; csv: (detailed: boolean) => void; say: Say; install: { installed: boolean; install: () => Promise<void>; instructionsOpen: boolean }; clientId: string }) {
  const file = useRef<HTMLInputElement>(null);
  const daily = backups.dailyBackup;
  return <Glass blur className={styles.card}>
    <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Your data</h2><span className={styles.cardMeta}>{saveStatus}</span></div>
    <p className={styles.hint}>Everything lives on this phone. Last backup file: {backups.lastBackup ? new Date(backups.lastBackup).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not yet"}.</p>
    <div className={styles.inline}>
      <Button variant="glass" size="small" icon={<Download/>} onClick={() => void backups.exportBackup()}>Download backup</Button>
      <Button variant="glass" size="small" icon={<Upload/>} onClick={() => file.current?.click()}>Restore</Button>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { void backups.importBackup(e.target.files?.[0]); e.target.value = ""; }}/>
    </div>
    {clientId && <Row label="Daily Drive backup" hint={daily.saving ? "Saving today's copy…" : daily.error || daily.message}><Toggle label="Daily Drive backup" checked={backups.dailyEnabled} onChange={() => backups.toggleDailyBackup()}/></Row>}
    {clientId && daily.needsConnection && <a className={styles.link} href="/classic">Connect Drive in the classic screens</a>}
    <Row label="Spreadsheet" hint="Every shift as a CSV file"><div className={styles.inline}><Button variant="glass" size="small" icon={<FileText/>} onClick={() => csv(false)}>CSV</Button><Button variant="glass" size="small" onClick={() => csv(true)}>With notes</Button></div></Row>
    <Row label="Protect storage" hint="Ask the browser never to clear it"><Button variant="glass" size="small" onClick={async () => { const granted = await navigator.storage?.persist?.(); say(granted ? "Storage protected. Keep a backup file too." : "The browser manages storage here. Keep a backup file."); }}>Protect</Button></Row>
    {!install.installed && <Row label="Add to home screen" hint={install.instructionsOpen ? "In Chrome, tap ⋮ and then Add to Home screen." : "Opens like an app, works offline"}><Button variant="glass" size="small" icon={<Smartphone/>} onClick={() => void install.install()}>Install</Button></Row>}
  </Glass>;
}
