"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ChevronDown, Download, FileSpreadsheet, Mail, Plus, RotateCcw, Send, X } from "lucide-react";
import Button from "../ui/button";
import HoldButton from "../ui/hold-button";
import RollingNumber from "../ui/rolling-number";
import SegmentedControl from "../ui/segmented-control";
import Sheet from "../ui/sheet";
import Toggle from "../ui/toggle";
import { fade, spring } from "../ui/motion";
import { tick } from "../ui/haptics";
import { columnLetter, displayDate, hhmm, reportLayout, type TimesheetRow, type WeeklyReport } from "@/lib/timesheet";
import { kr, type RecentShift } from "./today";
import styles from "./review.module.css";

/**
 * Review & send: the week exactly as the employer gets it. Every day can be edited in place (times,
 * split shifts, sick or day off, a note), the email can be rewritten, and the attachment is the real
 * Excel layout from the app, downloadable. Sending is a demo here: nothing leaves the phone from the lab.
 */
const MONDAY = "2026-11-09";
const TITLE = "Uge 46 - 2026";
const SHORT = ["Man", "Tirs", "Ons", "Tors", "Fre", "Lør", "Søn"];
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SPLIT = /(\d\d:\d\d)–(\d\d:\d\d) \+ (\d\d:\d\d)–(\d\d:\d\d)/;

type Piece = { start: string; end: string };
type Mark = "" | "syg" | "fri";
export type SheetDay = { date: string; pieces: Piece[]; mark?: Mark; note: string };

function dateOf(index: number) { const d = new Date(`${MONDAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + index); return d.toISOString().slice(0, 10); }
const minutesOf = (time: string) => /^\d\d:\d\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
export function pieceMinutes(piece: Piece) {
  const start = minutesOf(piece.start), end = minutesOf(piece.end);
  return Number.isFinite(start) && Number.isFinite(end) ? (end - start + 1440) % 1440 : 0;
}
const dayMinutes = (day: SheetDay) => day.pieces.reduce((sum, piece) => sum + pieceMinutes(piece), 0);

/** The week as logged in the lab: the demo shifts plus anything logged today. */
function seed(recent: RecentShift[], todayIndex: number): SheetDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const entries = recent.filter(entry => entry.day === LONG[index] || (entry.day === "Today" && index === todayIndex));
    const pieces: Piece[] = [], notes: string[] = [];
    for (const entry of [...entries].reverse()) {
      const split = entry.note?.match(SPLIT);
      if (entry.pieces?.length) { pieces.push(...entry.pieces); if (entry.note) notes.push(entry.note); }
      else if (split) pieces.push({ start: split[1], end: split[2] }, { start: split[3], end: split[4] });
      else { pieces.push({ start: entry.start.slice(-5), end: entry.end.slice(-5) }); if (entry.note) notes.push(entry.note); }
    }
    return { date: dateOf(index), pieces, note: notes.join(" · ") };
  });
}

export function useTimesheet(recent: RecentShift[], todayIndex: number, todayMark: Mark) {
  const [edited, setEdited] = useState<SheetDay[] | null>(null);
  const days = useMemo(() => (edited ?? seed(recent, todayIndex)).map((day, index) => ({ ...day, mark: day.mark ?? (index === todayIndex ? todayMark : "") })), [edited, recent, todayIndex, todayMark]);
  const total = days.reduce((sum, day) => sum + dayMinutes(day), 0);
  const shifts = days.filter(day => day.pieces.some(piece => pieceMinutes(piece) > 0)).length;
  return { days, total, shifts, edited: edited !== null, setDays: (next: SheetDay[]) => setEdited(next), reset: () => setEdited(null) };
}
export type Timesheet = ReturnType<typeof useTimesheet>;

export function weekReport(days: SheetDay[], includeNotes: boolean): WeeklyReport {
  const rows: TimesheetRow[] = days.flatMap((day, index) => {
    const pieces = day.pieces.filter(piece => piece.start || piece.end);
    return Array.from({ length: Math.max(2, pieces.length) }, (_, i) => ({
      day: SHORT[index], date: day.date, start: pieces[i]?.start ?? "", end: pieces[i]?.end ?? "", minutes: pieces[i] ? pieceMinutes(pieces[i]) : 0,
      syg: i === 0 && day.mark === "syg" ? "x" : "", fri: i === 0 && day.mark === "fri" ? "x" : "", sh: "", andet: "",
    }));
  });
  const remarks = days.map((day, index) => ({ day: SHORT[index], date: day.date, text: includeNotes ? day.note : "" }));
  return { title: TITLE, monday: MONDAY, sunday: dateOf(6), profile: { name: "", number: "", email: "" }, rows, remarks, total: rows.reduce((sum, row) => sum + row.minutes, 0), zone: "Europe/Copenhagen", includesNotes: includeNotes };
}

const validEmail = (value: string) => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value.trim());

export default function ReviewSheet({ open, onClose, sheet, sent, onSent, onEdited, say }: {
  open: boolean; onClose: () => void; sheet: Timesheet; sent: boolean; onSent: () => void; onEdited: () => void; say: (text: string) => void;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [to, setTo] = useState("");
  const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
  const [messageEdit, setMessageEdit] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [fullSheet, setFullSheet] = useState(false);
  const report = useMemo(() => weekReport(sheet.days, includeNotes), [sheet.days, includeNotes]);
  const layout = useMemo(() => reportLayout(report), [report]);
  const subject = subjectEdit ?? `${TITLE} – Ugeseddel`;
  const message = messageEdit ?? `Hej,\n\nHer er min ugeseddel for ${displayDate(report.monday)}–${displayDate(report.sunday)}.\nArbejdstid i alt: ${hhmm(report.total)}.\n\nVenlig hilsen`;
  const filename = "RouteHours-uge-46.xlsx";

  function change(index: number, patch: Partial<SheetDay>) {
    sheet.setDays(sheet.days.map((day, i) => i === index ? { ...day, ...patch } : day));
    onEdited();
  }
  function changePiece(index: number, piece: number, patch: Partial<Piece>) {
    change(index, { pieces: sheet.days[index].pieces.map((p, i) => i === piece ? { ...p, ...patch } : p) });
  }
  async function download() {
    try {
      const { createTimesheetFile } = await import("@/lib/timesheet-file");
      const file = await createTimesheetFile(report);
      const url = URL.createObjectURL(file), link = document.createElement("a");
      link.href = url; link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      say("Excel downloaded");
    } catch { say("Couldn't build the Excel file. Try again."); }
  }

  const ready = validEmail(to) && subject.trim().length > 0;
  return <Sheet open={open} onClose={onClose} title="Review & send" footer={<div className={styles.footer}>
    <HoldButton icon={<Send/>} disabled={!ready || sent} onConfirm={() => { onSent(); onClose(); say("Demo: nothing was sent. The real app sends this from your Gmail."); }}>{sent ? "Sent" : ready ? "Hold to send" : "Add who it goes to"}</HoldButton>
  </div>}>
    <div className={styles.review}>
      {/* The attachment, drawn from the real Excel layout */}
      <section className={styles.file}>
        <div className={styles.fileHead}>
          <span className={styles.fileIcon}><FileSpreadsheet/></span>
          <div className={styles.fileText}><strong>{filename}</strong><span className="numeric">{hhmm(report.total)} worked · {sheet.shifts} {sheet.shifts === 1 ? "day" : "days"} · {kr(report.total)} before tax</span></div>
        </div>
        <button type="button" className={`${styles.paper} ${fullSheet ? styles.paperOpen : ""}`} onClick={() => { tick(); setFullSheet(v => !v); }} aria-expanded={fullSheet} aria-label={fullSheet ? "Shrink the sheet preview" : "Show the whole sheet"}>
          <div className={styles.paperScroll}>
            <table className={styles.grid}>
              <thead><tr><th/>{layout.headers.map((_, i) => <th key={i}>{columnLetter(i)}</th>)}</tr></thead>
              <tbody>
                <tr><td className={styles.rowNo}>1</td><td colSpan={layout.headers.length} className={styles.gridTitle}>{report.title}</td></tr>
                <tr><td className={styles.rowNo}>2</td><td colSpan={layout.headers.length} className={styles.gridSub}>{displayDate(report.monday)} – {displayDate(report.sunday)} · {report.zone}</td></tr>
                <tr className={styles.gridHead}><td className={styles.rowNo}>3</td>{layout.headers.map(h => <td key={h}>{h}</td>)}</tr>
                {layout.dailyRows.map((row, r) => <tr key={row.date} className={row.minutes ? "" : styles.gridEmpty}>
                  <td className={styles.rowNo}>{r + 4}</td><td>{row.day}</td><td>{displayDate(row.date)}</td>
                  {Array.from({ length: layout.intervalCount }, (_, i) => [row.intervals[i]?.start ?? "", row.intervals[i]?.end ?? ""]).flat().map((value, i) => <td key={i} className="numeric">{value}</td>)}
                  <td>{row.syg}</td><td>{row.fri}</td><td>{row.sh}</td><td>{row.andet}</td><td className="numeric">{row.minutes ? hhmm(row.minutes) : ""}</td>
                </tr>)}
                <tr className={styles.gridTotal}><td className={styles.rowNo}>{layout.dailyRows.length + 4}</td><td colSpan={layout.totalColumn}>I alt · arbejdstid</td><td className="numeric">{hhmm(report.total)}</td></tr>
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
          <Button variant="glass" size="small" icon={<Download/>} onClick={() => void download()}>Download Excel</Button>
          <label className={styles.notesToggle}><span>Shift notes</span><Toggle checked={includeNotes} onChange={value => { tick(); setIncludeNotes(value); }} label="Include shift notes"/></label>
        </div>
      </section>

      {/* The days, editable in place */}
      <section className={styles.block}>
        <div className={styles.blockHead}><h3>Your days</h3>{sheet.edited && <button type="button" className={styles.link} onClick={() => { tick(); sheet.reset(); setOpenDay(null); say("Back to the logged hours"); }}><RotateCcw/> Undo edits</button>}</div>
        <ul className={styles.days}>
          {sheet.days.map((day, index) => {
            const minutes = dayMinutes(day), isOpen = openDay === index;
            return <li key={day.date} className={`${styles.day} ${isOpen ? styles.dayOpen : ""}`}>
              <button type="button" className={styles.dayRow} aria-expanded={isOpen} onClick={() => { tick(); setOpenDay(isOpen ? null : index); }}>
                <span className={styles.dayName}><strong>{EN[index]}</strong><small className="numeric">{displayDate(day.date).slice(0, 5)}</small></span>
                <span className={styles.dayTimes}>
                  {day.pieces.length ? day.pieces.map((p, i) => <span key={i} className="numeric">{p.start || "–"}–{p.end || "–"}</span>) : !day.mark && <span className={styles.muted}>Not worked</span>}
                  {day.mark && <span className={styles.chip}>{day.mark === "syg" ? "Sick" : "Day off"}</span>}
                </span>
                <span className={`${styles.dayTotal} numeric`}>{minutes ? hhmm(minutes) : ""}</span>
                <m.span className={styles.chev} animate={{ rotate: isOpen ? 180 : 0 }} transition={spring.snappy}><ChevronDown/></m.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && <m.div key="edit" className={styles.editWrap} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0, transition: fade }} transition={spring.smooth}>
                  <div className={styles.edit}>
                    <SegmentedControl label={`${LONG[index]} was`} value={day.mark || "worked"} onChange={value => change(index, { mark: value === "worked" ? "" : value })} options={[{ value: "worked", label: "Worked" }, { value: "syg", label: "Sick" }, { value: "fri", label: "Day off" }]}/>
                    {day.pieces.map((piece, i) => <div key={i} className={styles.piece}>
                      <label><span>{day.pieces.length > 1 ? `Start ${i + 1}` : "Start"}</span><input type="time" value={piece.start} onChange={event => changePiece(index, i, { start: event.target.value })}/></label>
                      <label><span>{day.pieces.length > 1 ? `End ${i + 1}` : "End"}</span><input type="time" value={piece.end} onChange={event => changePiece(index, i, { end: event.target.value })}/></label>
                      <button type="button" className={styles.remove} aria-label={`Remove ${LONG[index]} piece ${i + 1}`} onClick={() => change(index, { pieces: day.pieces.filter((_, j) => j !== i) })}><X/></button>
                    </div>)}
                    {day.pieces.length < 3 && <button type="button" className={styles.addPiece} onClick={() => change(index, { pieces: [...day.pieces, day.pieces.length ? { start: "12:25", end: "14:45" } : { start: "06:45", end: "08:10" }] })}><Plus/> {day.pieces.length ? "Add second part (split shift)" : "Add times"}</button>}
                    <label className={styles.note}><span>Note on the sheet</span><input value={day.note} maxLength={200} placeholder="Route, bus, anything your boss should know" onChange={event => change(index, { note: event.target.value })}/></label>
                  </div>
                </m.div>}
              </AnimatePresence>
            </li>;
          })}
        </ul>
        <div className={styles.sum}><span>Total worked</span><RollingNumber value={hhmm(report.total)} className={styles.sumValue}/></div>
      </section>

      {/* The email */}
      <section className={styles.block}>
        <div className={styles.blockHead}><h3>Email</h3><span className={styles.muted}><Mail/> From your Gmail</span></div>
        <label className={styles.mailField}><span>To</span><input type="email" inputMode="email" value={to} placeholder="employer@example.com" onChange={event => setTo(event.target.value)} aria-invalid={to.length > 0 && !validEmail(to) || undefined}/></label>
        <label className={styles.mailField}><span>Subject</span><input value={subject} onChange={event => setSubjectEdit(event.target.value)}/></label>
        <label className={styles.mailField}><span>Message</span><textarea rows={6} value={message} onChange={event => setMessageEdit(event.target.value)}/></label>
        {(subjectEdit !== null || messageEdit !== null) && <button type="button" className={styles.link} onClick={() => { setSubjectEdit(null); setMessageEdit(null); }}><RotateCcw/> Use the standard text</button>}
        <p className={styles.muted}>The lab never sends anything. In the real app this goes from your Gmail with the Excel file attached.</p>
      </section>
    </div>
  </Sheet>;
}
