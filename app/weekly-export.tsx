"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Mail, Share2, X } from "lucide-react";
import { buildWeeklyReport, displayDate, hhmm, moveWeek, reportLayout, type DayDetail, type DayDetails, type PayrollProfile, type WeeklyReport } from "@/lib/timesheet";
import { localDateKey, type Shift } from "@/lib/time";
import { saveSubmission, beginSubmission, allSubmissions, reportFingerprint, downloadBlob, type Submission } from "@/lib/storage";
import { shiftWarnings, dateInZone } from "@/lib/ledger";
import { gmailMessage, gmailToken, sendGmailMessage, validRecipient } from "@/lib/gmail";
import { useOnlineStatus } from "./offline-status";
import { useGoogleSession } from "./use-google-session";
import { clearGoogleSession } from "@/lib/google-session";
import { useSheetDismiss } from "./use-sheet-dismiss";

type Props = { initialWeek: string; zone: string; shifts: Shift[]; active: boolean; profile: PayrollProfile; onProfile: (p: PayrollProfile) => void; details: DayDetails; onDetails: (d: DayDetails) => void; onClose: () => void; onGoogle: (report: WeeklyReport, email: boolean) => void; clientId: string; onSettings: () => void };
const NOTES_KEY = "routehours:export-notes";
export default function WeeklyExport({ initialWeek, zone, shifts, active, profile, onProfile, details, onDetails, onClose, onGoogle, clientId, onSettings }: Props) {
  const online = useOnlineStatus();
  const [week, setWeek] = useState(() => moveWeek(initialWeek, 0));
  const [includeNotes, setIncludeNotes] = useState(() => { try { return localStorage.getItem(NOTES_KEY) === "true"; } catch { return false; } });
  const [step, setStep] = useState<"review" | "email">("review");
  const [historyReady, setHistoryReady] = useState(false);
  const [records, setRecords] = useState<Submission[]>([]);
  const [reviewed, setReviewed] = useState<Submission | null>(null);
  const {account:savedAccount,savedEmail}=useGoogleSession(clientId,"gmail");
  const authRequest=useRef<AbortController|null>(null);
  const [connecting, setConnecting] = useState(false);
  const account=connecting?null:savedAccount;
  useEffect(() => { const read = () => { void allSubmissions().then(value => { setRecords(value); setHistoryReady(true); }).catch(() => setGmailError("Saved email history could not be loaded. Reload before sending.")); }; read(); window.addEventListener("routehours:submissions",read); return () => window.removeEventListener("routehours:submissions",read); }, []);
  useEffect(() => { setSubjectEdit(null); setMessageEdit(null); setReviewed(null); setStep("review"); setSent(null); setGmailError(""); }, [week]);
  useEffect(() => {setConnecting(false);return () => {authRequest.current?.abort();};},[clientId]);
  const [status, setStatus] = useState("");
  const [fileError, setFileError] = useState("");
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState<{ key: string; file: File } | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [sent, setSent] = useState<{ recipient: string; filename: string } | null>(null);
  const [gmailError, setGmailError] = useState("");
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [messageEdit, setMessageEdit] = useState<string | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLFieldSetElement>(null);
  const { dismiss, closing } = useSheetDismiss(modal, onClose, () => !sendingRef.current);
  const report = useMemo(() => buildWeeklyReport(shifts, week, profile, details, includeNotes, zone), [shifts, week, profile, details, includeNotes, zone]);
  const layout = useMemo(() => reportLayout(report), [report]);
  // Recipient/message edits must not invalidate the attachment.
  const attachmentKey = reportFingerprint(report);
  const previous = records.filter(r => r.week === report.monday);
  const uncertain = previous.find(r => r.status === "sending" || r.status === "uncertain");
  const warnings = shiftWarnings(shifts.filter(s => dateInZone(s.end, zone) >= report.monday && dateInZone(s.start, zone) <= report.sunday));
  const file = prepared?.key === attachmentKey ? prepared.file : null;
  const subject = subjectEdit ?? `${report.title} – ${profile.name || "Ugeseddel"}`;
  const message = messageEdit ?? `Hej,\n\nHer er min ugeseddel for ${displayDate(report.monday)}–${displayDate(report.sunday)}.\nArbejdstid i alt: ${hhmm(report.total)}.\n${profile.number ? `Løn-nr.: ${profile.number}\n` : ""}\nVenlig hilsen\n${profile.name}`;

  useEffect(() => {
    let cancelled = false; setFileError("");
    const timer = setTimeout(() => {
      void import("@/lib/timesheet-file").then(m => m.createTimesheetFile(JSON.parse(attachmentKey) as WeeklyReport)).then(file => {
        if (!cancelled) setPrepared({ key: attachmentKey, file });
      }).catch(() => { if (!cancelled) setFileError("The attachment could not be created. Check your connection and retry."); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attachmentKey, retry]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; modal.current?.focus();
    const inert = Array.from(document.querySelectorAll<HTMLElement>(".topbar,.main-grid,.mobile-dock")); inert.forEach(el => el.inert = true);
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape" && !sendingRef.current) dismiss();
      if (event.key !== "Tab") return;
      const items = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href]') || []).filter(el => el.getClientRects().length && !el.closest("fieldset:disabled"));
      const first = items[0], last = items[items.length - 1]; if (!first) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = overflow; inert.forEach(el => el.inert = false); document.removeEventListener("keydown", keys); if (previous?.isConnected) previous.focus(); };
  }, [dismiss]);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [step]);
  function toggleNotes() {
    const next = !includeNotes; setIncludeNotes(next); setStatus("");
    try { localStorage.setItem(NOTES_KEY, String(next)); } catch { setStatus("This choice applies now, but browser storage could not remember it."); }
  }
  function downloadFile() {
    if (!file) return;
    const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000); setStatus("Excel file downloaded.");
  }
  async function shareFile() {
    if (!file) return;
    if (!navigator.canShare?.({ files: [file] })) { downloadFile(); setStatus("File sharing is unavailable here. Your file was downloaded. Use Send with Gmail to email it directly."); return; }
    try { await navigator.share({ files: [file], title: subject, text: message }); setStatus("Opened the share menu. Finish sending in your chosen app."); }
    catch (error) { setStatus((error as Error).name === "AbortError" ? "Sharing cancelled. Your file is still ready." : "Sharing could not open. Use Download or Send with Gmail instead."); }
  }
  async function connectAccount(changeAccount=false) {
    if (!online) { setGmailError("Go online to connect Gmail. Your file and message are still here."); return; }
    if(connecting)return;
    const controller=new AbortController();authRequest.current?.abort();authRequest.current=controller;
    setConnecting(true); setGmailError("");
    try { await gmailToken(clientId,{forceAccountChoice:changeAccount,signal:controller.signal}); }
    catch(e) { if(!controller.signal.aborted)setGmailError((e as Error).message); } finally { if(authRequest.current===controller&&!controller.signal.aborted)setConnecting(false); }
  }
  async function sendEmail() {
    if (!file || sendingRef.current || connecting || sent || uncertain || !validRecipient(profile.email) || !subject.trim() || !account || !historyReady || !online) return;
    if (account.expires < Date.now()) { clearGoogleSession(clientId,"gmail"); setGmailError("Your Google session expired. Your sender is saved; continue with Gmail to renew access."); return; }
    if (!reviewed || reviewed.fingerprint !== attachmentKey) { setStep("review"); setGmailError("The report changed. Review the updated file before sending."); return; }
    sendingRef.current = true; setSending(true); setGmailError("");
    let record: Submission = { ...reviewed, recipient: profile.email.trim(), subject, message, sender: account.email, createdAt: new Date().toISOString(), status: "sending" };
    let attempted = false, confirmed = false;
    try {
      const latest = await allSubmissions();
      setRecords(latest);
      const duplicate = latest.some(r => r.week === report.monday && r.status === "sent" && r.fingerprint === attachmentKey);
      if (duplicate && !window.confirm("This same report was already sent. Send another copy?")) return;
      const raw = await gmailMessage(record.recipient, subject, message, file, account.email);
      await beginSubmission(record, duplicate);
      setStatus("Sending your email with its attachment…"); attempted = true;
      const gmailId = await sendGmailMessage(account.token, raw); confirmed = true;
      record = { ...record, gmailId, status: "sent" };
      setSent({ recipient: record.recipient, filename: file.name });
      await saveSubmission(record); setStatus("");
    } catch(error) {
      const message = error instanceof Error ? error.message : "Gmail could not send this email.";
      if(/session expired|revoked/.test(message))clearGoogleSession(clientId,"gmail");
      if (confirmed) { setStatus("Gmail confirmed sending, but the receipt could not be saved. Do not resend. Keep a copy of your file and check Gmail Sent."); }
      else {
        if (attempted) await saveSubmission({ ...record, status: /Nothing was sent|Gmail rejected/i.test(message) ? "reviewed" : "uncertain" }).catch(() => {});
        setGmailError(message); setStatus("");
      }
    } finally { sendingRef.current = false; setSending(false); }
  }
  function updateDay(date: string, key: keyof DayDetail, value: string) { onDetails({ ...details, [date]: { ...details[date], [key]: value } }); }
  async function showEmail() {
    if (!file || !historyReady) return;
    if (warnings.length && !window.confirm(warnings.map(w => w.message).join("\n") + "\nHave you checked these times?")) return;
    const entry: Submission = { id: crypto.randomUUID(), week: report.monday, report: structuredClone(report), fingerprint: attachmentKey, recipient: profile.email, sender: "", subject, message, filename: file.name, attachment: file, createdAt: new Date().toISOString(), status: "reviewed" };
    try { await saveSubmission(entry); setReviewed(entry); setStep("email"); setStatus(""); } catch(e) { setGmailError((e as Error).message); }
  }
  return <div className="modal-backdrop report-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}>
    <div className={`modal report-modal calm-report ${sent ? "is-complete" : ""}`} data-step={step} role="dialog" aria-modal="true" aria-labelledby="report-heading" ref={modal} tabIndex={-1}>
      <div className="modal-head"><div><h2 id="report-heading">{sent ? "Email sent" : step === "review" ? "Weekly timesheet" : "Send with Gmail"}</h2>{!sent && <div className="report-flow" aria-label="Timesheet progress"><span aria-current={step === "review" ? "step" : undefined}>Review</span><ArrowRight size={12}/><span aria-current={step === "email" ? "step" : undefined}>Email</span></div>}</div><button className="icon-btn" aria-label="Close weekly timesheet" disabled={sending || closing} onClick={dismiss}><X size={19}/></button></div>
      {sent ? <div className="gmail-success modal-body"><span><Check size={30}/></span><h3>All sent.</h3><p>Gmail sent <strong>{sent.filename}</strong> to <strong>{sent.recipient}</strong>.</p>{status && <p className="form-error" role="alert">{status}</p>}<a href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer">Open Gmail Sent</a><button className="modal-submit" disabled={closing} onClick={dismiss}>Done <Check size={17}/></button></div> : <>
      <fieldset className="report-fields modal-body" ref={body} disabled={sending || closing}>
      {step === "review" ? <div className="report-step" key="review">
        <div className="report-week"><button className="icon-btn" aria-label="Previous week" onClick={() => setWeek(moveWeek(week, -1))}><ChevronLeft size={19}/></button><label><strong>{report.title}</strong><input type="date" aria-label="Choose a date in the week" value={week} onChange={e => { if (e.target.value) setWeek(moveWeek(e.target.value, 0)); }}/></label><button className="icon-btn" aria-label="Next week" onClick={() => setWeek(moveWeek(week, 1))}><ChevronRight size={19}/></button></div>
        <div className="week-total"><span>Total worked</span><strong>{hhmm(report.total)}<small>hours</small></strong></div>
        <div className="report-day-list" aria-label="Daily timesheet preview">{layout.dailyRows.map(day => <div className={`report-day ${day.intervals.length ? "" : "is-empty"}`} key={day.date}><div className="report-day-date"><strong>{day.day}</strong><small>{displayDate(day.date).slice(0,5)}</small></div><div className="report-day-times">{day.intervals.length ? day.intervals.map((interval,i) => <span key={i}>{interval.start}–{interval.end}</span>) : <span>—</span>}{(day.syg || day.fri || day.sh || day.andet) && <small>{[["Syg",day.syg],["Fri",day.fri],["SH",day.sh],["Andet",day.andet]].filter(([,v]) => v).map(([label,value]) => `${label}: ${value}`).join(" · ")}</small>}</div><strong>{hhmm(day.minutes)}</strong></div>)}</div>
        {previous.length > 0 && <details className="receipt-history"><summary>Saved email records · {previous.length}</summary>{previous.map(r => <div className="receipt-row" key={r.id}><div><strong>{r.status === "sent" ? "Sent" : r.status === "reviewed" ? "Reviewed" : "Check Gmail Sent"}</strong><small>{r.recipient} · {new Date(r.createdAt).toLocaleString("en-GB")}</small></div><button className="icon-btn" aria-label="Download original attachment" onClick={() => downloadBlob(r.attachment,r.filename)}><Download size={17}/></button></div>)}</details>}
        {uncertain && <div className="review-warning"><strong>Check your Gmail Sent folder first</strong><p>A previous send could not be confirmed. Avoid sending twice.</p><a href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer">Open Gmail Sent</a><button onClick={async () => { if (window.confirm("Only continue if you checked Gmail and this email was NOT sent. Mark this attempt as not sent?")) await saveSubmission({...uncertain,status:"reviewed"}).catch(e => setGmailError(e.message)); }}>I checked — it was not sent</button><button onClick={async () => { if (window.confirm("Did you find this exact email and attachment in Gmail Sent?")) await saveSubmission({...uncertain,status:"sent",gmailId:"user-confirmed"}).catch(e => setGmailError(e.message)); }}>I found it in Gmail Sent</button></div>}
        {active && <p className="report-hint">Your running shift is not included. Stop and save it first.</p>}
        <label className="report-include notes-switch"><input type="checkbox" checked={includeNotes} onChange={toggleNotes}/><span><strong>Include shift notes & AI summaries</strong><small>{includeNotes ? "Included in this file. Switch them off anytime." : "Off — your shift notes stay out of the file."}</small></span><i aria-hidden="true"/></label>
        <details className="report-details"><summary>{profile.name || "Add your name"}<span>{profile.number ? `Payroll ${profile.number}` : "Name & payroll number"}</span></summary><div className="report-profile"><label>Full name<input value={profile.name} maxLength={120} placeholder="Your full name" onChange={e => onProfile({ ...profile, name: e.target.value })}/></label><label>Payroll number<input value={profile.number} maxLength={60} placeholder="Employee number" onChange={e => onProfile({ ...profile, number: e.target.value })}/></label></div></details>
        <details className="report-details"><summary>See the Excel layout</summary><div className="report-table-scroll" tabIndex={0} aria-label="Weekly timesheet preview"><table className="report-table"><thead><tr>{layout.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{layout.dailyRows.map(r => <tr key={r.date}>{[r.day, displayDate(r.date), ...Array.from({length:layout.intervalCount},(_,i) => [r.intervals[i]?.start || "—",r.intervals[i]?.end || "—"]).flat(), r.syg, r.fri, r.sh, r.andet, hhmm(r.minutes)].map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={layout.totalColumn}>I alt · arbejdstid</th><td>{hhmm(report.total)}</td></tr></tfoot></table></div><p className="report-hint">{report.zone} · Absence entries do not change worked hours.</p>{layout.remarks.length > 0 && <div className="report-remarks">{layout.remarks.map(r => <div key={r.date}><strong>{r.day} · {displayDate(r.date)}</strong><p>{r.text}</p></div>)}</div>}</details>
        <details className="report-details"><summary>Absence & extra remarks</summary><p>Syg = sick · Fri = day off. Leave SH blank unless your employer explains it. These manual remarks are included separately from shift notes.</p>{report.remarks.map(day => <div className="report-day-editor" key={day.date}><strong>{day.day} · {displayDate(day.date)}</strong><div className="report-categories">{([ ["syg", "Syg"], ["fri", "Fri"], ["sh", "SH"], ["andet", "Andet"] ] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={`${day.day} ${label}`} value={details[day.date]?.[key] || ""} maxLength={40} onChange={e => updateDay(day.date, key, e.target.value)}/></label>)}</div><label>Extra remarks<textarea maxLength={2000} value={details[day.date]?.remarks || ""} onChange={e => updateDay(day.date, "remarks", e.target.value)}/></label></div>)}</details>
      </div> : <div className="report-step" key="email"><button className="report-back" onClick={() => { setStep("review"); setGmailError(""); setStatus(""); }}><ArrowLeft size={16}/> Review week</button><p className="report-intro">Your message and Excel file, sent together from your Gmail account.</p><label>To<input type="email" aria-label="Recipient email" value={profile.email} maxLength={254} placeholder="employer@example.com" onChange={e => onProfile({ ...profile, email: e.target.value })}/></label><label>Subject<input aria-label="Email subject" value={subject} maxLength={150} onChange={e => setSubjectEdit(e.target.value.replace(/[\r\n]/g, ""))}/></label><label>Message<textarea className="email-message" aria-label="Email message" value={message} maxLength={10000} onChange={e => setMessageEdit(e.target.value)}/></label>
        <div className="report-ready" aria-live="polite"><FileSpreadsheet size={23}/><div><strong>{file?.name || "Creating your attachment…"}</strong><span>{file ? `${Math.ceil(file.size / 1024)} KB · ${includeNotes ? "Shift notes included" : "No shift notes"}` : "Your Excel file will be attached automatically"}</span></div>{file && <Check size={16}/>}</div>
        <div className="gmail-account"><span>{account ? "Sending from " + account.email : savedEmail ? "Saved sender: " + savedEmail + ". Continue with Gmail to renew access." : "Connect Gmail below, then review the sender before sending."}</span>{(account || savedEmail) && <button className="secondary-btn" disabled={connecting || !online} onClick={() => void connectAccount(true)}>{connecting ? "Connecting…" : "Change account"}</button>}{!clientId && <button className="text-action" onClick={onSettings}>Set up Google in Settings</button>}</div>
        <p className="report-hint">Connecting your account does not send the email.</p>
        {gmailError && <div className="gmail-error" role="alert"><p>{gmailError}</p><details><summary>Gmail setup</summary><p>Use the same Google Web client ID as Sheets. In its Google project, <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">enable Gmail API</a>, add <code>https://www.googleapis.com/auth/gmail.send</code> in <a href="https://console.cloud.google.com/auth/scopes" target="_blank" rel="noopener noreferrer">Data Access</a>, and add your account as a test user if needed.</p><button className="secondary-btn" onClick={onSettings}>Open app settings</button></details></div>}
      </div>}
      {step === "review" && gmailError && <p className="form-error" role="alert">{gmailError}</p>}
      {fileError && <p className="gmail-error" role="alert">{fileError} <button onClick={() => setRetry(n => n + 1)}>Retry attachment</button></p>}
      <details className="report-details other-exports"><summary>Google Sheets options</summary><div className="report-google"><button className="secondary-btn" disabled={!online} onClick={() => onGoogle(report, false)}><FileSpreadsheet size={17}/> Save to Sheets</button><button className="secondary-btn" disabled={!online} onClick={() => onGoogle(report, true)}><Mail size={17}/> Email a Sheet link</button></div>{!online && <p>Go online to create a Google Sheet. Excel downloads still work.</p>}</details>
      </fieldset>
      <div className="modal-actions report-actions">
        <p className={`report-action-hint ${gmailError || fileError ? "is-error" : ""}`} role={gmailError || fileError ? "alert" : "status"}>{gmailError || fileError || (!online ? "Offline · download your file now, send when online." : status || (file ? `${hhmm(report.total)} hours · ${includeNotes ? "Notes included" : "No shift notes"}${step === "email" && account ? ` · ${account.email}` : ""}` : "Preparing your Excel attachment…"))}</p>
        {step === "review" ? <button className="modal-submit continue-email" disabled={!file || !historyReady || Boolean(uncertain) || sending || closing} onClick={() => void showEmail()}>Continue to email<ArrowRight size={18}/></button> : !account ? <button className="modal-submit gmail-connect" disabled={connecting || !online || closing} onClick={clientId ? () => void connectAccount() : onSettings}><Mail size={18}/>{connecting ? "Connecting…" : clientId ? savedEmail ? "Continue with Gmail" : "Connect Gmail" : "Set up Google"}</button> : <button className="modal-submit gmail-send" disabled={!file || !validRecipient(profile.email) || !subject.trim() || sending || connecting || !online || Boolean(uncertain) || closing} onClick={() => void sendEmail()}><Mail size={18}/>{sending ? "Sending…" : "Send email with attachment"}</button>}
        <div className="report-quick-actions"><button className="secondary-btn" disabled={!file || sending || closing} onClick={downloadFile}><Download size={16}/>{file ? "Download Excel" : "Creating file…"}</button><button className="secondary-btn" disabled={!file || sending || closing} onClick={() => void shareFile()}><Share2 size={16}/> Share to app</button></div>
      </div>
      </>}
    </div>
  </div>;
}
