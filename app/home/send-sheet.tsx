"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, ChevronDown, Download, FileSpreadsheet, Mail, Plus, RotateCcw, Send, Share2, TriangleAlert, X } from "lucide-react";
import { buildWeeklyReport, columnLetter, displayDate, hhmm, reportLayout, type DayDetail, type DayDetails, type PayrollProfile, type WeeklyReport } from "@/lib/timesheet";
import { allSubmissions, beginSubmission, downloadBlob, reportFingerprint, saveSubmission, type Submission } from "@/lib/storage";
import { addDays, dateInZone, dayLedger, shiftWarnings, timeInZone, zonedInstant } from "@/lib/ledger";
import { gmailMessage, gmailToken, sendGmailMessage, validRecipient } from "@/lib/gmail";
import { clearGoogleSession } from "@/lib/google-session";
import { templateShift, type ShiftTemplate } from "@/lib/templates";
import type { Shift } from "@/lib/time";
import { useGoogleSession } from "../use-google-session";
import Button from "../ui/button";
import HoldButton from "../ui/hold-button";
import RollingNumber from "../ui/rolling-number";
import SegmentedControl from "../ui/segmented-control";
import Sheet from "../ui/sheet";
import Toggle from "../ui/toggle";
import { fade, spring, tf } from "../ui/motion";
import { tick } from "../ui/haptics";
import type { ToastMessage } from "../ui/toast";
import { kr, toMinutes } from "./usual";
import styles from "./send.module.css";

const NOTES_KEY = "routehours:export-notes";
const EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Say = (text: string, action?: ToastMessage["action"]) => void;

type Props = {
  open: boolean; onClose: () => void; week: string; zone: string; shifts: Shift[]; running: boolean;
  profile: PayrollProfile; onProfile: (value: PayrollProfile) => void; details: DayDetails; onDetails: (value: DayDetails) => void;
  templates: ShiftTemplate[]; onShifts: (change: (shifts: Shift[]) => Shift[]) => void; clientId: string; online: boolean; rate: number;
  say: Say; onSettings: () => void;
};

/**
 * Review & send: the week exactly as the employer gets it. The days can be fixed right here (times,
 * split shifts, sick or day off, a note) and those changes are saved to your shifts. The email goes
 * from your Gmail with the real Excel file. Sending is the one thing you can't undo, so you hold it.
 */
export default function SendSheet(props: Props) {
  return <Sheet open={props.open} onClose={props.onClose} title="Review & send">{props.open && <Body {...props}/>}</Sheet>;
}

/** Sends still waiting on Gmail. Kept outside the sheet, so closing and reopening it can't unlock a send in flight. */
const inFlight = new Set<string>();

function Body({ onClose, week, zone, shifts, running, profile, onProfile, details, onDetails, templates, onShifts, clientId, online, rate, say, onSettings }: Props) {
  // Off until you switch it on, as in the classic export: notes and summaries only go to the employer by choice.
  const [includeNotes, setIncludeNotes] = useState(() => { try { return localStorage.getItem(NOTES_KEY) === "true"; } catch { return false; } });
  const [records, setRecords] = useState<Submission[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [prepared, setPrepared] = useState<{ key: string; file: File } | null>(null);
  const [fileError, setFileError] = useState("");
  const [retry, setRetry] = useState(0);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [sent, setSent] = useState<{ recipient: string; filename: string; note?: string } | null>(null);
  const [gmailError, setGmailError] = useState("");
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [messageEdit, setMessageEdit] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [againFor, setAgainFor] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [fullSheet, setFullSheet] = useState(false);
  const [confirming, setConfirming] = useState<"" | "notSent" | "found">("");
  // Decided once per opening, so typing in one field never hides the other mid-edit.
  const [askProfile] = useState(() => !profile.name || !profile.number);
  const { account: savedAccount, savedEmail } = useGoogleSession(clientId, "gmail");
  const account = connecting ? null : savedAccount;
  const authRequest = useRef<AbortController | null>(null);
  useEffect(() => () => authRequest.current?.abort(), []);

  useEffect(() => {
    const read = () => { void allSubmissions().then(value => { setRecords(value); setHistoryReady(true); }).catch(() => setGmailError("Saved email history could not be loaded. Reload before sending.")); };
    read(); window.addEventListener("routehours:submissions", read);
    return () => window.removeEventListener("routehours:submissions", read);
  }, []);

  const firstFile = useRef(true);
  const report = useMemo(() => buildWeeklyReport(shifts, week, profile, details, includeNotes, zone), [shifts, week, profile, details, includeNotes, zone]);
  const layout = useMemo(() => reportLayout(report), [report]);
  // Recipient and message edits must not change the attachment.
  const attachmentKey = reportFingerprint(report);
  const previous = records.filter(r => r.week === report.monday);
  const uncertain = previous.find(r => r.status === "sending" || r.status === "uncertain");
  const warnings = shiftWarnings(shifts.filter(s => dateInZone(s.end, zone) >= report.monday && dateInZone(s.start, zone) <= report.sunday));
  const file = prepared?.key === attachmentKey ? prepared.file : null;
  const subject = subjectEdit ?? `${report.title} – ${profile.name || "Ugeseddel"}`;
  const message = messageEdit ?? `Hej,\n\nHer er min ugeseddel for ${displayDate(report.monday)}–${displayDate(report.sunday)}.\nArbejdstid i alt: ${hhmm(report.total)}.\n${profile.number ? `Løn-nr.: ${profile.number}\n` : ""}\nVenlig hilsen\n${profile.name}`;
  const days = layout.dailyRows.filter(row => row.minutes > 0).length;

  useEffect(() => {
    let cancelled = false; setFileError("");
    // The first file waits until the sheet has risen; later ones (after an edit) follow quickly.
    const timer = setTimeout(() => {
      void import("@/lib/timesheet-file").then(mod => mod.createTimesheetFile(JSON.parse(attachmentKey) as WeeklyReport)).then(made => { if (!cancelled) setPrepared({ key: attachmentKey, file: made }); })
        .catch(() => { if (!cancelled) setFileError("The Excel file couldn't be made. Try again."); });
    }, firstFile.current ? 600 : 180);
    firstFile.current = false;
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attachmentKey, retry]);

  function toggleNotes(value: boolean) {
    tick(); setIncludeNotes(value);
    try { localStorage.setItem(NOTES_KEY, String(value)); } catch { /* applies now */ }
  }
  function downloadFile() {
    if (!file) return;
    downloadBlob(file, file.name); say("Excel downloaded");
  }
  async function shareFile() {
    if (!file) return;
    if (!navigator.canShare?.({ files: [file] })) { downloadFile(); return; }
    try { await navigator.share({ files: [file], title: subject, text: message }); }
    catch (error) { if ((error as Error).name !== "AbortError") say("Sharing didn't open. Download it instead."); }
  }
  async function connect(change = false) {
    if (!clientId) { onSettings(); return; }
    if (!online) { setGmailError("Go online to connect Gmail. Everything here stays as it is."); return; }
    if (connecting) return;
    const controller = new AbortController(); authRequest.current?.abort(); authRequest.current = controller;
    setConnecting(true); setGmailError("");
    try { await gmailToken(clientId, { forceAccountChoice: change, signal: controller.signal }); }
    catch (e) { if (!controller.signal.aborted) setGmailError((e as Error).message); }
    finally { if (authRequest.current === controller && !controller.signal.aborted) setConnecting(false); }
  }

  async function send() {
    if (!file || sendingRef.current || connecting || sent || uncertain || !validRecipient(profile.email) || !subject.trim() || !account || !historyReady || !online) return;
    if (account.expires < Date.now()) { clearGoogleSession(clientId, "gmail"); setGmailError("Your Google sign-in ran out. Connect Gmail again; nothing was sent."); return; }
    sendingRef.current = true; setSending(true); setGmailError("");
    let record: Submission = { id: crypto.randomUUID(), week: report.monday, report: structuredClone(report), fingerprint: attachmentKey, recipient: profile.email.trim(), sender: account.email, subject, message, filename: file.name, attachment: file, createdAt: new Date().toISOString(), status: "sending" };
    let attempted = false, confirmed = false;
    try {
      const latest = await allSubmissions();
      setRecords(latest);
      const duplicate = latest.some(r => r.week === report.monday && r.status === "sent" && r.fingerprint === attachmentKey);
      // The same sheet twice needs a second, deliberate hold.
      if (duplicate && againFor !== attachmentKey) { setAgainFor(attachmentKey); setGmailError("You already sent this exact sheet. Hold again to send another copy."); return; }
      const raw = await gmailMessage(record.recipient, subject, message, file, account.email);
      inFlight.add(record.id);
      await beginSubmission(record, duplicate);
      attempted = true;
      const gmailId = await sendGmailMessage(account.token, raw); confirmed = true;
      record = { ...record, gmailId, status: "sent" };
      setSent({ recipient: record.recipient, filename: file.name });
      await saveSubmission(record);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Gmail could not send this email.";
      if (/session expired|revoked/.test(text)) clearGoogleSession(clientId, "gmail");
      if (confirmed) setSent(current => current && { ...current, note: "Gmail sent it, but the receipt couldn't be saved here. Don't send it again; check Gmail Sent." });
      else {
        if (attempted) await saveSubmission({ ...record, status: /Nothing was sent|Gmail rejected/i.test(text) ? "reviewed" : "uncertain" }).catch(() => {});
        setGmailError(text);
      }
    } finally {
      sendingRef.current = false; setSending(false);
      if (inFlight.delete(record.id)) window.dispatchEvent(new Event("routehours:submissions"));
    }
  }

  // Fixing a day writes straight to your shifts and day notes, so the app and the sheet never disagree.
  function setDetail(date: string, patch: Partial<DayDetail>) { onDetails({ ...details, [date]: { ...details[date], ...patch } }); }
  function markOf(date: string) { const d = details[date]; return d?.syg ? "syg" : d?.fri ? "fri" : "worked"; }
  function setMark(date: string, value: string) { tick(); setDetail(date, { syg: value === "syg" ? details[date]?.syg || "x" : "", fri: value === "fri" ? details[date]?.fri || "x" : "" }); }
  function retime(shift: Shift, date: string, which: "start" | "end", value: string) {
    if (!/^\d\d:\d\d$/.test(value)) return;
    const startTime = which === "start" ? value : timeInZone(shift.start, zone), endTime = which === "end" ? value : timeInZone(shift.end, zone);
    const endDate = toMinutes(endTime) <= toMinutes(startTime) ? addDays(date, 1) : date;
    try {
      // The time you didn't touch keeps its recorded instant, so a shift in the hour repeated when the
      // clocks go back stays editable (rebuilding that time would be refused as ambiguous).
      const start = which === "end" && date === dateInZone(shift.start, zone) ? shift.start : zonedInstant(`${date}T${startTime}`, zone, true);
      const end = which === "start" && endDate === dateInZone(shift.end, zone) ? shift.end : zonedInstant(`${endDate}T${endTime}`, zone, true);
      onShifts(list => list.map(s => s.id === shift.id ? { ...s, start, end, summary: undefined, summaryStatus: undefined, summaryError: undefined } : s));
    } catch (e) { say(e instanceof Error ? e.message : "Check that time"); }
  }
  function removePiece(shift: Shift) {
    tick();
    onShifts(list => list.filter(s => s.id !== shift.id));
    say("Shift removed", { label: "Undo", onClick: () => onShifts(list => list.some(s => s.id === shift.id) ? list : [shift, ...list]) });
  }
  function addPiece(date: string, count: number) {
    tick();
    const sorted = templates.slice().sort((a, b) => a.start.localeCompare(b.start));
    const template = sorted[count] ?? sorted[0] ?? { id: "manual", name: "Shift", start: "07:00", end: "09:00" };
    try { const made = templateShift(template, date, zone); onShifts(list => [made, ...list]); }
    catch (e) { say(e instanceof Error ? e.message : "Couldn't add that shift"); }
  }

  const ready = Boolean(file) && validRecipient(profile.email) && subject.trim().length > 0 && Boolean(account) && historyReady && online && !uncertain;
  const holdLabel = sending ? "Sending…" : !profile.email.trim() ? "Add who it goes to" : !validRecipient(profile.email) ? "Check the email address" : !account ? "Connect Gmail first" : !online ? "Offline" : !file ? "Making the file…" : againFor === attachmentKey ? "Hold to send again" : "Hold to send";

  if (sent) return <div className={styles.done}>
    <m.span className={styles.doneIcon} initial={{ transform: tf({ scale: 0.4 }), opacity: 0 }} animate={{ transform: tf(), opacity: 1 }} transition={spring.reward}><Check/></m.span>
    <h3 className="serif">Sent</h3>
    <p>Gmail sent <strong>{sent.filename}</strong> to <strong>{sent.recipient}</strong>.</p>
    {sent.note && <p className={styles.alertText} role="alert">{sent.note}</p>}
    <div className={styles.doneActions}>
      <a className={styles.link} href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer"><Mail/> Open Gmail Sent</a>
      <Button variant="primary" onClick={onClose}>Done</Button>
    </div>
  </div>;

  return <div className={styles.review}>
    {/* The attachment, drawn from the real Excel layout */}
    <section className={styles.file}>
      <div className={styles.fileHead}>
        <span className={styles.fileIcon}><FileSpreadsheet/></span>
        <div className={styles.fileText}><strong>{report.title.replace("Uge", "Week")}</strong><span className="numeric">{hhmm(report.total)} worked · {days} {days === 1 ? "day" : "days"} · {kr(report.total, rate)} before tax</span></div>
      </div>
      <button type="button" className={`${styles.paper} ${fullSheet ? styles.paperOpen : ""}`} onClick={() => { tick(); setFullSheet(v => !v); }} aria-expanded={fullSheet} aria-label={fullSheet ? "Shrink the sheet preview" : "Show the whole sheet"}>
        <div className={styles.paperScroll}>
          <table className={styles.grid}>
            <thead><tr><th/>{layout.headers.map((_, i) => <th key={i}>{columnLetter(i)}</th>)}</tr></thead>
            <tbody>
              <tr><td className={styles.rowNo}>1</td><td colSpan={layout.headers.length} className={styles.gridTitle}>{report.title}</td></tr>
              <tr><td className={styles.rowNo}>2</td><td colSpan={layout.headers.length} className={styles.gridSub}>{[profile.name, profile.number && `Løn-nr. ${profile.number}`].filter(Boolean).join(" · ") || "Navn"}</td></tr>
              <tr><td className={styles.rowNo}>3</td><td colSpan={layout.headers.length} className={styles.gridSub}>{displayDate(report.monday)} – {displayDate(report.sunday)} · {report.zone}</td></tr>
              <tr className={styles.gridHead}><td className={styles.rowNo}>4</td>{layout.headers.map(h => <td key={h}>{h}</td>)}</tr>
              {layout.dailyRows.map((row, r) => <tr key={row.date} className={row.minutes ? "" : styles.gridEmpty}>
                <td className={styles.rowNo}>{r + 5}</td><td>{row.day}</td><td>{displayDate(row.date)}</td>
                {Array.from({ length: layout.intervalCount }, (_, i) => [row.intervals[i]?.start ?? "", row.intervals[i]?.end ?? ""]).flat().map((value, i) => <td key={i} className="numeric">{value}</td>)}
                <td>{row.syg}</td><td>{row.fri}</td><td>{row.sh}</td><td>{row.andet}</td><td className="numeric">{row.minutes ? hhmm(row.minutes) : ""}</td>
              </tr>)}
              <tr className={styles.gridTotal}><td className={styles.rowNo}>{layout.dailyRows.length + 5}</td><td colSpan={layout.totalColumn}>I alt · arbejdstid</td><td className="numeric">{hhmm(report.total)}</td></tr>
              {layout.remarks.length > 0 && <>
                <tr><td className={styles.rowNo}/><td colSpan={layout.headers.length} className={styles.gridSub}>Bemærkninger</td></tr>
                {layout.remarks.map(row => <tr key={row.date}><td className={styles.rowNo}/><td>{row.day}</td><td>{displayDate(row.date)}</td><td colSpan={layout.headers.length - 2} className={styles.gridNote}>{row.text}</td></tr>)}
              </>}
            </tbody>
          </table>
        </div>
        {!fullSheet && <span className={styles.paperFade} aria-hidden="true"><span>Tap to see the whole sheet</span></span>}
      </button>
      <div className={styles.fileActions}>
        <Button variant="glass" size="small" icon={<Download/>} onClick={downloadFile} disabled={!file}>{file ? "Download" : "Making…"}</Button>
        <Button variant="glass" size="small" icon={<Share2/>} onClick={() => void shareFile()} disabled={!file}>Share</Button>
        <label className={styles.notesToggle}><span>Shift notes</span><Toggle checked={includeNotes} onChange={toggleNotes} label="Include shift notes"/></label>
      </div>
      {fileError && <p className={styles.alertText} role="alert">{fileError} <button type="button" className={styles.link} onClick={() => setRetry(n => n + 1)}><RotateCcw/> Try again</button></p>}
    </section>

    {running && <p className={styles.muted}>Your running shift isn&apos;t on the sheet until you finish it.</p>}
    {warnings.length > 0 && <div className={styles.warn} role="alert"><TriangleAlert aria-hidden="true"/><div>{[...new Set(warnings.map(w => w.message))].map(w => <p key={w}>{w}</p>)}</div></div>}
    {uncertain && <Uncertain record={uncertain} confirming={confirming} setConfirming={setConfirming} onError={setGmailError}/>}

    {/* The days, editable in place */}
    <section className={styles.block}>
      <div className={styles.blockHead}><h3>Your days</h3><span className={styles.muted}>Tap a day to fix it</span></div>
      <ul className={styles.days}>
        {layout.dailyRows.map((row, index) => {
          const date = row.date, isOpen = openDay === date, mark = markOf(date);
          const pieces = dayLedger(shifts, date, zone);
          return <li key={date} className={`${styles.day} ${isOpen ? styles.dayOpen : ""}`}>
            <button type="button" className={styles.dayRow} aria-expanded={isOpen} onClick={() => { tick(); setOpenDay(isOpen ? null : date); }}>
              <span className={styles.dayName}><strong>{EN[index]}</strong><small className="numeric">{displayDate(date).slice(0, 5)}</small></span>
              <span className={styles.dayTimes}>
                {row.intervals.length ? row.intervals.map((p, i) => <span key={i} className="numeric">{p.start || "–"}–{p.end || "–"}</span>) : mark === "worked" && <span className={styles.muted}>Not worked</span>}
                {mark !== "worked" && <span className={styles.chip}>{mark === "syg" ? "Sick" : "Day off"}</span>}
              </span>
              <span className={`${styles.dayTotal} numeric`}>{row.minutes ? hhmm(row.minutes) : ""}</span>
              <span className={styles.chev} aria-hidden="true"><ChevronDown/></span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && <m.div key="edit" className={styles.editWrap} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0, transition: fade }} transition={spring.smooth}>
                <div className={styles.edit}>
                  <SegmentedControl label={`${LONG[index]} was`} value={mark} onChange={value => setMark(date, value)} options={[{ value: "worked", label: "Worked" }, { value: "syg", label: "Sick" }, { value: "fri", label: "Day off" }]}/>
                  {pieces.map((piece, i) => {
                    const whole = piece.start === piece.shift.start && piece.end === piece.shift.end;
                    return <div key={piece.shift.id + piece.shift.start + piece.shift.end} className={styles.piece}>
                      <label><span>{pieces.length > 1 ? `Start ${i + 1}` : "Start"}</span><input type="time" defaultValue={timeInZone(piece.start, zone)} disabled={!whole} onChange={e => retime(piece.shift, date, "start", e.target.value)}/></label>
                      <label><span>{pieces.length > 1 ? `End ${i + 1}` : "End"}</span><input type="time" defaultValue={piece.endsAtMidnight ? "23:59" : timeInZone(piece.end, zone)} disabled={!whole} onChange={e => retime(piece.shift, date, "end", e.target.value)}/></label>
                      <button type="button" className={styles.remove} aria-label={`Remove ${LONG[index]} shift ${i + 1}`} onClick={() => removePiece(piece.shift)}><X/></button>
                    </div>;
                  })}
                  {pieces.length < 3 && <button type="button" className={styles.addPiece} onClick={() => addPiece(date, pieces.length)}><Plus/> {pieces.length ? "Add second part (split shift)" : "Add times"}</button>}
                  <label className={styles.note}><span>Note on the sheet</span><input defaultValue={details[date]?.remarks ?? ""} maxLength={2000} placeholder="Anything your boss should know" onChange={e => setDetail(date, { remarks: e.target.value })}/></label>
                </div>
              </m.div>}
            </AnimatePresence>
          </li>;
        })}
      </ul>
      <div className={styles.sum}><span>Total worked</span><RollingNumber value={hhmm(report.total)} className={styles.sumValue}/></div>
    </section>

    {/* Who you are, on the sheet */}
    {askProfile && <section className={styles.block}>
      <div className={styles.blockHead}><h3>On the sheet</h3><span className={styles.muted}>Saved for next week</span></div>
      <label className={styles.mailField}><span>Your name</span><input value={profile.name} maxLength={120} placeholder="Full name" onChange={e => onProfile({ ...profile, name: e.target.value })}/></label>
      <label className={styles.mailField}><span>Løn-nr.</span><input value={profile.number} maxLength={60} inputMode="numeric" placeholder="Payroll number" onChange={e => onProfile({ ...profile, number: e.target.value })}/></label>
    </section>}

    {/* The email */}
    <section className={styles.block}>
      <div className={styles.blockHead}><h3>Email</h3><span className={styles.muted}><Mail/> {account ? account.email : savedEmail || "From your Gmail"}</span></div>
      <label className={styles.mailField}><span>To</span><input type="email" inputMode="email" aria-label="Recipient email" value={profile.email} maxLength={254} placeholder="employer@example.com" onChange={e => onProfile({ ...profile, email: e.target.value })} aria-invalid={profile.email.length > 0 && !validRecipient(profile.email) || undefined}/></label>
      <label className={styles.mailField}><span>Subject</span><input value={subject} maxLength={150} onChange={e => setSubjectEdit(e.target.value.replace(/[\r\n]/g, ""))}/></label>
      <label className={styles.mailField}><span>Message</span><textarea rows={6} value={message} maxLength={10000} onChange={e => setMessageEdit(e.target.value)}/></label>
      {(subjectEdit !== null || messageEdit !== null) && <button type="button" className={styles.link} onClick={() => { setSubjectEdit(null); setMessageEdit(null); }}><RotateCcw/> Use the standard text</button>}
      {!account
        ? <Button variant="glass" icon={<Mail/>} onClick={() => void connect()} disabled={connecting || (!!clientId && !online)}>{connecting ? "Connecting…" : !clientId ? "Set up Google in Settings" : savedEmail ? `Continue as ${savedEmail}` : "Connect Gmail"}</Button>
        : <button type="button" className={styles.link} onClick={() => void connect(true)} disabled={connecting || !online}>Send from another account</button>}
      {gmailError && <p className={styles.alertText} role="alert">{gmailError}</p>}
    </section>

    {previous.length > 0 && <section className={styles.block}>
      <div className={styles.blockHead}><h3>Sent before</h3></div>
      <ul className={styles.records}>{previous.map(r => <li key={r.id}>
        <span><strong>{r.status === "sent" ? "Sent" : r.status === "reviewed" ? "Not sent" : "Check Gmail Sent"}</strong><small>{r.recipient || "No recipient"} · {new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
        <button type="button" className={styles.remove} aria-label="Download the file that was sent" onClick={() => downloadBlob(r.attachment, r.filename)}><Download/></button>
      </li>)}</ul>
    </section>}

    <div className={styles.sendBar}>
      <HoldButton icon={<Send/>} disabled={!ready || sending} onConfirm={() => void send()}>{holdLabel}</HoldButton>
    </div>
  </div>;
}

/** A send that was never confirmed: check Gmail Sent before anything else, so it never goes twice. */
function Uncertain({ record, confirming, setConfirming, onError }: { record: Submission; confirming: "" | "notSent" | "found"; setConfirming: (value: "" | "notSent" | "found") => void; onError: (message: string) => void }) {
  if (inFlight.has(record.id)) return <div className={styles.warn} role="status"><TriangleAlert aria-hidden="true"/><div>
    <p><strong>Still sending.</strong> Gmail hasn&apos;t answered yet. Wait here; this updates by itself.</p>
  </div></div>;
  async function mark(found: boolean) {
    if (inFlight.has(record.id)) return;
    const step = found ? "found" : "notSent";
    if (confirming !== step) { setConfirming(step); return; }
    setConfirming("");
    await saveSubmission(found ? { ...record, status: "sent", gmailId: "user-confirmed" } : { ...record, status: "reviewed" }).catch(e => onError((e as Error).message));
  }
  return <div className={styles.warn} role="alert"><TriangleAlert aria-hidden="true"/><div>
    <p><strong>Check Gmail Sent first.</strong> A send on {new Date(record.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} wasn&apos;t confirmed.</p>
    <div className={styles.inline}>
      <a className={styles.link} href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer">Open Gmail Sent</a>
      <button type="button" className={styles.link} onClick={() => void mark(true)}>{confirming === "found" ? "Tap again: it was sent" : "I found it"}</button>
      <button type="button" className={styles.link} onClick={() => void mark(false)}>{confirming === "notSent" ? "Tap again: it wasn't sent" : "It wasn't sent"}</button>
    </div>
  </div></div>;
}
