"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Mail, Share2, X } from "lucide-react";
import { buildWeeklyReport, displayDate, hhmm, moveWeek, reportHeaders, type DayDetail, type DayDetails, type PayrollProfile, type WeeklyReport } from "@/lib/timesheet";
import { localDateKey, type Shift } from "@/lib/time";

type Props = { shifts: Shift[]; active: boolean; profile: PayrollProfile; onProfile: (p: PayrollProfile) => void; details: DayDetails; onDetails: (d: DayDetails) => void; onClose: () => void; onGoogle: (report: WeeklyReport, email: boolean) => void };

export default function WeeklyExport({ shifts, active, profile, onProfile, details, onDetails, onClose, onGoogle }: Props) {
  const [week, setWeek] = useState(() => moveWeek(localDateKey(new Date().toISOString()), 0));
  const [includeNotes, setIncludeNotes] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ report: WeeklyReport; file: File } | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const report = useMemo(() => buildWeeklyReport(shifts, week, profile, details, includeNotes), [shifts, week, profile, details, includeNotes]);
  const file = prepared?.report === report ? prepared.file : null;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.current?.focus();
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keys); previous?.focus(); };
  }, [onClose]);

  async function prepareFile() {
    setBusy(true); setStatus("");
    try { const { createTimesheetFile } = await import("@/lib/timesheet-file"); setPrepared({ report, file: await createTimesheetFile(report) }); setStatus("Your Excel file is ready. Share it to your email app, or download it."); }
    catch { setStatus("Could not prepare the file. Try again, or create a Google Sheet."); }
    finally { setBusy(false); }
  }
  function downloadFile() {
    if (!file) return;
    const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus("File downloaded. If you use Email draft, attach this file before sending.");
  }
  async function shareFile() {
    if (!file) return;
    if (!navigator.canShare?.({ files: [file] })) { downloadFile(); setStatus("This browser cannot attach files to a share menu. File downloaded — open Email draft and attach it."); return; }
    try { await navigator.share({ files: [file], title: `${report.title} · ${profile.name || "RouteHours"}` }); setStatus("File handed to your share menu. Finish sending in your chosen app."); }
    catch (error) { if ((error as Error).name !== "AbortError") setStatus("Sharing could not open. Download the file and attach it to your email instead."); }
  }
  function updateDay(date: string, key: keyof DayDetail, value: string) { onDetails({ ...details, [date]: { ...details[date], [key]: value } }); }
  const subject = `${report.title} – ${profile.name || "Ugeseddel"}`;
  const body = `Hej,\n\nHer er min ugeseddel for ${displayDate(report.monday)}–${displayDate(report.sunday)}.\nArbejdstid i alt: ${hhmm(report.total)}.\n${profile.number ? `Løn-nr.: ${profile.number}\n` : ""}\nVenlig hilsen\n${profile.name}`;
  return <div className="modal-backdrop report-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-heading" ref={modal} tabIndex={-1}>
      <div className="modal-head"><div><span className="small-kicker">REVIEW · EXPORT · SEND</span><h2 id="report-heading">Your weekly timesheet</h2></div><button className="icon-btn" aria-label="Close weekly timesheet" onClick={onClose}><X size={19}/></button></div>
      <p className="report-intro">One clear file for your employer. Review the week, then choose how to send it.</p>
      <div className="report-week"><button className="icon-btn" aria-label="Previous week" onClick={() => setWeek(moveWeek(week, -1))}><ChevronLeft size={19}/></button><label><strong>{report.title}</strong><input type="date" aria-label="Choose a date in the week" value={week} onChange={e => { if (e.target.value) setWeek(moveWeek(e.target.value, 0)); }}/></label><button className="icon-btn" aria-label="Next week" onClick={() => setWeek(moveWeek(week, 1))}><ChevronRight size={19}/></button></div>
      <div className="report-profile"><label>Navn · name<input value={profile.name} maxLength={120} placeholder="Your full name" onChange={e => onProfile({ ...profile, name: e.target.value })}/></label><label>Løn-nr. · payroll number<input value={profile.number} maxLength={60} placeholder="Employee number" onChange={e => onProfile({ ...profile, number: e.target.value })}/></label></div>
      {active && <p className="report-hint">Your running shift is not included. Stop and save it first if it belongs in this week.</p>}
      {!report.rows.some(r => r.start) && <p className="report-hint">No saved shifts this week. Choose another week or enter absence details below.</p>}
      <div className="report-preview-label"><span>UGESEDDEL PREVIEW</span><strong>{hhmm(report.total)} worked</strong></div>
      <div className="report-table-scroll" tabIndex={0} aria-label="Weekly timesheet preview, scroll horizontally for all columns"><table className="report-table"><thead><tr>{reportHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{report.rows.map((r, i) => <tr key={`${r.date}-${i}`}>{[r.day, displayDate(r.date), r.start || "—", r.end || "—", r.syg, r.fri, r.sh, r.andet, hhmm(r.minutes)].map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={8}>I alt · arbejdstid</th><td>{hhmm(report.total)}</td></tr></tfoot></table></div>
      <p className="report-hint">Times shown in {report.zone}. Syg / Fri / SH / Andet are manual entries and do not change worked hours.</p>
      <details className="report-details"><summary>Absence & extra remarks <span>Saved automatically</span></summary><p>Syg = sick · Fri = day off. Leave SH blank unless your employer explains it. Enter a mark or hours exactly as your employer requests.</p>{report.remarks.map(day => <div className="report-day-editor" key={day.date}><strong>{day.day} · {displayDate(day.date)}</strong><div className="report-categories">{([ ["syg", "Syg"], ["fri", "Fri"], ["sh", "SH"], ["andet", "Andet"] ] as const).map(([key, label]) => <label key={key}>{label}<input aria-label={`${day.day} ${label}`} value={details[day.date]?.[key] || ""} maxLength={40} onChange={e => updateDay(day.date, key, e.target.value)}/></label>)}</div><label>Extra remarks<textarea maxLength={2000} value={details[day.date]?.remarks || ""} onChange={e => updateDay(day.date, "remarks", e.target.value)} placeholder="Optional note for this day"/></label></div>)}</details>
      <label className="report-include"><input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)}/><span>Include shift notes & AI summaries<small>Review the remarks below before sharing.</small></span></label>
      <details className="report-details" open><summary>Bemærkninger · remarks</summary><div className="report-remarks">{report.remarks.map(r => <div key={r.date}><strong>{r.day} · {displayDate(r.date)}</strong><p>{r.text || "No remarks"}</p></div>)}</div></details>
      <div className="report-delivery"><span className="small-kicker">READY TO SEND</span><h3>Send your week</h3><p>Excel is editable and opens in Excel or Google Sheets. On your phone, choose your email app from Share.</p><label>Recipient email · optional<input type="email" value={profile.email} maxLength={254} placeholder="employer@example.com" onChange={e => onProfile({ ...profile, email: e.target.value })}/></label>
        {!file ? <button className="modal-submit" disabled={busy} onClick={() => void prepareFile()}><FileSpreadsheet size={18}/>{busy ? "Preparing Excel…" : "Prepare Excel file"}</button> : <><div className="report-ready"><FileSpreadsheet size={22}/><div><strong>{file.name}</strong><span>Ready · {Math.ceil(file.size / 1024)} KB</span></div></div><div className="report-actions"><button className="modal-submit" onClick={() => void shareFile()}><Share2 size={18}/> Share file</button><button className="secondary-btn" onClick={downloadFile}><Download size={17}/> Download</button></div><a className="report-email" href={`mailto:${encodeURIComponent(profile.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={16}/> Open email draft</a><small className="report-hint">Email draft fills in your message; attach the downloaded Excel file yourself.</small></>}
        <div className="report-google"><button className="secondary-btn" onClick={() => onGoogle(report, false)}><FileSpreadsheet size={17}/> Save to Google Sheets</button><button className="secondary-btn" onClick={() => onGoogle(report, true)}><Mail size={17}/> Email Google Sheets link</button></div><small className="report-hint">Google Sheets options need your Google client ID in Settings and Google sign-in.</small>
        {status && <p className="report-status" role="status">{status}</p>}
      </div>
    </div>
  </div>;
}
