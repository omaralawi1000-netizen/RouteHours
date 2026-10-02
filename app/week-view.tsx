"use client";

import { useEffect, useState } from "react";
import { TemplatePicker } from "./shift-templates";
import type { ShiftTemplate } from "@/lib/templates";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { buildWeeklyReport, moveWeek, type DayDetails, type PayrollProfile } from "@/lib/timesheet";
import { dateInZone, dayLedger, shiftWarnings, timeInZone } from "@/lib/ledger";
import { durationLabel, type Shift } from "@/lib/time";
import { allSubmissions, downloadBlob, reportFingerprint, type Submission } from "@/lib/storage";

type Props = { week: string; onWeek: (week: string) => void; shifts: Shift[]; profile: PayrollProfile; details: DayDetails; zone: string; onReview: () => void; onEdit: (shift: Shift) => void; onAdd: () => void; templates: ShiftTemplate[]; onSettings: () => void };

export default function WeekView({ week, onWeek, shifts, profile, details, zone, onReview, onEdit, onAdd, templates, onSettings }: Props) {
  const [receipts, setReceipts] = useState<Submission[]>([]), [error, setError] = useState("");
  useEffect(() => {
    const read = () => { void allSubmissions().then(setReceipts).catch(() => setError("Saved email records could not be read. Try reloading.")); };
    read(); window.addEventListener("routehours:submissions", read);
    return () => window.removeEventListener("routehours:submissions", read);
  }, []);
  const report = buildWeeklyReport(shifts, week, profile, details, false, zone);
  const weekly = shifts.filter(s => dateInZone(s.end, zone) >= report.monday && dateInZone(s.start, zone) <= report.sunday);
  const warnings = shiftWarnings(weekly);
  const records = receipts.filter(r => r.week === report.monday);
  const last = records.find(r => r.status === "sent");
  const uncertain = records.find(r => r.status === "sending" || r.status === "uncertain");
  const currentKey = (r: Submission) => reportFingerprint(buildWeeklyReport(shifts, week, profile, details, r.report.includesNotes, zone));
  const changed = last && last.fingerprint !== currentKey(last);
  const reviewed = records.some(r => r.status === "reviewed" && r.fingerprint === currentKey(r));
  const today = dateInZone(Date.now(), zone);

  return <section className="week-view">
    <div className="week-navigation">
      <button className="icon-btn" aria-label="Previous week" onClick={() => onWeek(moveWeek(week, -1))}><ChevronLeft size={20}/></button>
      <label><span>{report.title.replace("Uge", "Week")}</span><input type="date" aria-label="Week starting" value={week} onChange={e => e.target.value && onWeek(moveWeek(e.target.value, 0))}/></label>
      <button className="icon-btn" aria-label="Next week" onClick={() => onWeek(moveWeek(week, 1))}><ChevronRight size={20}/></button>
    </div>
    <div className="week-heading">
      <div><h1>Your week</h1><p><strong>{durationLabel(report.total)}</strong> recorded</p></div>
      <span className={"receipt-badge " + (changed || uncertain ? "warning" : "")}>{uncertain ? "Check Gmail Sent" : changed ? "Changed since sending" : last ? "Sent" : reviewed ? "Reviewed" : "Draft"}</span>
    </div>
    <button className="modal-submit week-review" onClick={onReview}>Review & send<ArrowRight size={18}/></button>
    <div className="week-day-list" key={report.monday}>
      {report.remarks.map(day => {
        const pieces = dayLedger(shifts, day.date, zone), date = new Date(day.date + "T12:00Z");
        const absence = [["Sick", details[day.date]?.syg], ["Day off", details[day.date]?.fri], ["SH", details[day.date]?.sh], ["Other", details[day.date]?.andet]].filter(([, value]) => value);
        return <div className={"week-day " + (day.date === today ? "is-today " : "") + (pieces.length ? "has-shifts" : "")} key={day.date}>
          <div className="day-date"><span>{date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span><strong>{date.getUTCDate()}</strong></div>
          <div className="day-content">
            <div className="day-title"><strong>{date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}{day.date === today && <span className="today-mark">Today</span>}</strong><span>{pieces.length ? durationLabel(pieces.reduce((n, p) => n + p.minutes, 0)) : "—"}</span></div>
            {pieces.length ? <div className="day-intervals">{pieces.map(p => <button className="week-shift" key={p.shift.id} onClick={() => onEdit(p.shift)} aria-label={"Edit " + timeInZone(p.start, zone) + " to " + (p.endsAtMidnight ? "24:00" : timeInZone(p.end, zone)) + " shift on " + day.date}>{timeInZone(p.start, zone)}<span>–</span>{p.endsAtMidnight ? "24:00" : timeInZone(p.end, zone)}<ArrowRight size={13}/></button>)}</div> : <small>{absence.length ? absence.map(([label]) => label).join(" · ") : "No shift"}</small>}
            {pieces.length > 0 && absence.length > 0 && <small>{absence.map(([label, value]) => label + ": " + value).join(" · ")}</small>}
          </div>
        </div>;
      })}
    </div>
    {warnings.length > 0 && <div className="review-warning"><strong>{warnings.length} {warnings.length === 1 ? "thing" : "things"} to check</strong>{warnings.map((w, i) => <button key={i} onClick={() => { const shift = shifts.find(s => s.id === w.ids[0]); if (shift) onEdit(shift); }}>{w.message}<ArrowRight size={14}/></button>)}</div>}
    <button className="text-action" onClick={onAdd}><Plus size={17}/>Add a missing shift</button>
    <TemplatePicker templates={templates} week={week} zone={zone} onDraft={onEdit} onSettings={onSettings}/>
    {records.length > 0 && <details className="receipt-history"><summary>Email records · {records.length}</summary>{records.map(r => <div className="receipt-row" key={r.id}><Check size={17}/><div><strong>{r.status === "sent" ? "Sent" : r.status === "reviewed" ? "Reviewed, not sent" : "Sending not confirmed — check Gmail"}</strong><small>{r.recipient || "No recipient yet"} · {new Date(r.createdAt).toLocaleString("en-GB")}</small><small>{r.filename}</small></div><button className="icon-btn" aria-label="Download saved attachment" onClick={() => downloadBlob(r.attachment, r.filename)}><Download size={18}/></button></div>)}</details>}
    {error && <p role="alert">{error}</p>}
    <p className="zone-caption">Times in {zone} · Completed shifts only</p>
  </section>;
}
