"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Mail, Share2, X } from "lucide-react";
import { buildWeeklyReport, displayDate, hhmm, moveWeek, reportHeaders, type DayDetail, type DayDetails, type PayrollProfile, type WeeklyReport } from "@/lib/timesheet";
import { localDateKey, type Shift } from "@/lib/time";
import { gmailMessage, gmailToken, sendGmailMessage, validRecipient } from "@/lib/gmail";

type Props = { shifts: Shift[]; active: boolean; profile: PayrollProfile; onProfile: (p: PayrollProfile) => void; details: DayDetails; onDetails: (d: DayDetails) => void; onClose: () => void; onGoogle: (report: WeeklyReport, email: boolean) => void; clientId: string; onSettings: () => void };
const NOTES_KEY = "routehours:export-notes";
export default function WeeklyExport({ shifts, active, profile, onProfile, details, onDetails, onClose, onGoogle, clientId, onSettings }: Props) {
  const [week, setWeek] = useState(() => moveWeek(localDateKey(new Date().toISOString()), 0));
  const [includeNotes, setIncludeNotes] = useState(() => { try { return localStorage.getItem(NOTES_KEY) === "true"; } catch { return false; } });
  const [step, setStep] = useState<"review" | "email">("review");
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
  const report = useMemo(() => buildWeeklyReport(shifts, week, profile, details, includeNotes), [shifts, week, profile, details, includeNotes]);
  // Recipient/message edits must not invalidate the attachment.
  const attachmentKey = JSON.stringify({ ...report, profile: { ...profile, email: "" } });
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
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape" && !sendingRef.current) onClose();
      if (event.key !== "Tab") return;
      const items = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href]') || []).filter(el => el.getClientRects().length && !el.closest("fieldset:disabled"));
      const first = items[0], last = items[items.length - 1]; if (!first) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keys); previous?.focus(); };
  }, [onClose]);
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
  async function sendEmail() {
    if (!file || sendingRef.current || sent || !validRecipient(profile.email) || !subject.trim()) return;
    sendingRef.current = true; setSending(true); setGmailError(""); setStatus("Choose your Gmail account to send this email.");
    const recipient = profile.email.trim(); const attachment = file;
    try {
      // OAuth must start in the click gesture, before awaiting attachment encoding.
      const account = await gmailToken(clientId);
      const raw = await gmailMessage(recipient, subject, message, attachment, account.email);
      setStatus("Sending your email with its attachment…");
      await sendGmailMessage(account.token, raw);
      setSent({ recipient, filename: attachment.name }); setStatus("");
    } catch (error) { setGmailError(error instanceof Error ? error.message : "Gmail could not send this email."); setStatus(""); }
    finally { sendingRef.current = false; setSending(false); }
  }
  function updateDay(date: string, key: keyof DayDetail, value: string) { onDetails({ ...details, [date]: { ...details[date], [key]: value } }); }
  function showEmail() { setStep("email"); setStatus(""); modal.current?.scrollTo({ top: 0 }); }
  return <div className="modal-backdrop report-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !sendingRef.current) onClose(); }}>
    <div className="modal report-modal calm-report" role="dialog" aria-modal="true" aria-labelledby="report-heading" ref={modal} tabIndex={-1}>
      <div className="modal-head report-sticky-head"><div><span className="small-kicker">{step === "review" ? "01 / YOUR WEEK" : "02 / SEND IT"}</span><h2 id="report-heading">{sent ? "Email sent" : step === "review" ? "Weekly timesheet" : "Send with Gmail"}</h2></div><button className="icon-btn" aria-label="Close weekly timesheet" disabled={sending} onClick={onClose}><X size={19}/></button></div>
      {sent ? <div className="gmail-success"><span><Check size={30}/></span><h3>All sent.</h3><p>Gmail sent <strong>{sent.filename}</strong> to <strong>{sent.recipient}</strong>.</p><a href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer">Open Gmail Sent</a><button className="modal-submit" onClick={onClose}>Done <Check size={17}/></button></div> : <fieldset className="report-fields" disabled={sending}>
      {step === "review" ? <div className="report-step" key="review">
        <div className="report-week"><button className="icon-btn" aria-label="Previous week" onClick={() => setWeek(moveWeek(week, -1))}><ChevronLeft size={19}/></button><label><strong>{report.title}</strong><input type="date" aria-label="Choose a date in the week" value={week} onChange={e => { if (e.target.value) setWeek(moveWeek(e.target.value, 0)); }}/></label><button className="icon-btn" aria-label="Next week" onClick={() => setWeek(moveWeek(week, 1))}><ChevronRight size={19}/></button></div>
        <div className="week-total"><span>Worked this week</span><strong>{hhmm(report.total)}<small>hours</small></strong><div className="week-strip">{report.remarks.map(day => <div key={day.date}><span>{day.day}</span><b>{hhmm(report.rows.filter(r => r.date === day.date).reduce((sum, r) => sum + r.minutes, 0))}</b></div>)}</div></div>
        {active && <p className="report-hint">Your running shift is not included. Stop and save it first.</p>}
        <label className="report-include notes-switch"><input type="checkbox" checked={includeNotes} onChange={toggleNotes}/><span><strong>Include shift notes & AI summaries</strong><small>{includeNotes ? "Included in this file. Switch them off anytime." : "Off — your shift notes stay out of the file."}</small></span><i aria-hidden="true"/></label>
        <details className="report-details"><summary>{profile.name || "Add your name"}<span>{profile.number ? `Payroll ${profile.number}` : "Name & payroll number"}</span></summary><div className="report-profile"><label>Full name<input value={profile.name} maxLength={120} placeholder="Your full name" onChange={e => onProfile({ ...profile, name: e.target.value })}/></label><label>Payroll number<input value={profile.number} maxLength={60} placeholder="Employee number" onChange={e => onProfile({ ...profile, number: e.target.value })}/></label></div></details>
        <details className="report-details"><summary>Preview the full sheet</summary><div className="report-table-scroll" tabIndex={0} aria-label="Weekly timesheet preview"><table className="report-table"><thead><tr>{reportHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{report.rows.map((r, i) => <tr key={`${r.date}-${i}`}>{[r.day, displayDate(r.date), r.start || "—", r.end || "—", r.syg, r.fri, r.sh, r.andet, hhmm(r.minutes)].map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={8}>I alt · arbejdstid</th><td>{hhmm(report.total)}</td></tr></tfoot></table></div><p className="report-hint">{report.zone} · Absence entries do not change worked hours.</p><div className="report-remarks">{report.remarks.filter(r => r.text).map(r => <div key={r.date}><strong>{r.day} · {displayDate(r.date)}</strong><p>{r.text}</p></div>)}</div></details>
        <details className="report-details"><summary>Absence & extra remarks</summary><p>Syg = sick · Fri = day off. Leave SH blank unless your employer explains it. These manual remarks are included separately from shift notes.</p>{report.remarks.map(day => <div className="report-day-editor" key={day.date}><strong>{day.day} · {displayDate(day.date)}</strong><div className="report-categories">{([ ["syg", "Syg"], ["fri", "Fri"], ["sh", "SH"], ["andet", "Andet"] ] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={`${day.day} ${label}`} value={details[day.date]?.[key] || ""} maxLength={40} onChange={e => updateDay(day.date, key, e.target.value)}/></label>)}</div><label>Extra remarks<textarea maxLength={2000} value={details[day.date]?.remarks || ""} onChange={e => updateDay(day.date, "remarks", e.target.value)}/></label></div>)}</details>
        <button className="modal-submit continue-email" onClick={showEmail}>Continue to email <ArrowRight size={18}/></button>
      </div> : <div className="report-step" key="email"><button className="report-back" onClick={() => { setStep("review"); setGmailError(""); setStatus(""); }}><ArrowLeft size={16}/> Review week</button><p className="report-intro">Your message and Excel file, sent together from your Gmail account.</p><label>To<input type="email" aria-label="Recipient email" value={profile.email} maxLength={254} placeholder="employer@example.com" onChange={e => onProfile({ ...profile, email: e.target.value })}/></label><label>Subject<input aria-label="Email subject" value={subject} maxLength={150} onChange={e => setSubjectEdit(e.target.value.replace(/[\r\n]/g, ""))}/></label><label>Message<textarea className="email-message" aria-label="Email message" value={message} maxLength={10000} onChange={e => setMessageEdit(e.target.value)}/></label>
        <div className="report-ready" aria-live="polite"><FileSpreadsheet size={23}/><div><strong>{file?.name || "Creating your attachment…"}</strong><span>{file ? `${Math.ceil(file.size / 1024)} KB · ${includeNotes ? "Shift notes included" : "No shift notes"}` : "Your Excel file will be attached automatically"}</span></div>{file && <Check size={16}/>}</div>
        <button className="modal-submit gmail-send" disabled={!file || !validRecipient(profile.email) || !subject.trim() || sending} onClick={() => void sendEmail()}><Mail size={18}/>{sending ? "Sending…" : "Send email with attachment"}</button>
        <p className="report-hint">Choose your Google account when prompted. This sends the message above with the Excel file attached.</p>
        {gmailError && <div className="gmail-error" role="alert"><p>{gmailError}</p><details><summary>Gmail setup</summary><p>Use the same Google Web client ID as Sheets. In its Google project, <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">enable Gmail API</a>, add <code>https://www.googleapis.com/auth/gmail.send</code> in <a href="https://console.cloud.google.com/auth/scopes" target="_blank" rel="noopener noreferrer">Data Access</a>, and add your account as a test user if needed.</p><button className="secondary-btn" onClick={onSettings}>Open app settings</button></details></div>}
      </div>}
      {fileError && <p className="gmail-error" role="alert">{fileError} <button onClick={() => setRetry(n => n + 1)}>Retry attachment</button></p>}
      <div className="report-quick-actions"><button className="secondary-btn" disabled={!file} onClick={downloadFile}><Download size={17}/>{file ? "Download Excel" : "Creating file…"}</button><button className="secondary-btn" disabled={!file} onClick={() => void shareFile()}><Share2 size={17}/> Share to app</button></div>
      <details className="report-details other-exports"><summary>Google Sheets options</summary><div className="report-google"><button className="secondary-btn" onClick={() => onGoogle(report, false)}><FileSpreadsheet size={17}/> Save to Sheets</button><button className="secondary-btn" onClick={() => onGoogle(report, true)}><Mail size={17}/> Email a Sheet link</button></div></details>
      </fieldset>}
      {status && <p className="report-status" role="status">{status}</p>}
    </div>
  </div>;
}
