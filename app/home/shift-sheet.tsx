"use client";

import { useState } from "react";
import { Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { addDays, dateInZone, shiftWarnings, timeInZone, zonedInstant } from "@/lib/ledger";
import type { Shift } from "@/lib/time";
import Button from "../ui/button";
import Sheet from "../ui/sheet";
import { hm, toMinutes } from "./usual";
import styles from "./home.module.css";

/** Add or edit one shift: the day, when it started and finished, and its notes. */
export default function ShiftSheet({ shift, isNew, shifts, zone, onClose, onSave, onDelete }: {
  shift: Shift | null; isNew: boolean; shifts: Shift[]; zone: string; onClose: () => void; onSave: (updated: Shift) => void; onDelete: (shift: Shift) => void;
}) {
  // The form lives in its own component keyed by the shift, so every open starts from the saved values.
  return <Sheet open={!!shift} onClose={onClose} title={isNew ? "Add a shift" : "Edit shift"}>
    {shift && <Form key={shift.id + shift.start + shift.end} shift={shift} isNew={isNew} shifts={shifts} zone={zone} onSave={onSave} onDelete={onDelete}/>}
  </Sheet>;
}

function Form({ shift, isNew, shifts, zone, onSave, onDelete }: { shift: Shift; isNew: boolean; shifts: Shift[]; zone: string; onSave: (updated: Shift) => void; onDelete: (shift: Shift) => void }) {
  const [date, setDate] = useState(() => dateInZone(shift.start, zone));
  const [start, setStart] = useState(() => timeInZone(shift.start, zone));
  const [end, setEnd] = useState(() => timeInZone(shift.end, zone));
  const [notes, setNotes] = useState(() => shift.notes.join("\n"));
  const [error, setError] = useState("");
  const [warned, setWarned] = useState<string[] | null>(null);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d\d:\d\d$/.test(start) && /^\d\d:\d\d$/.test(end);
  const nextDay = valid && toMinutes(end) <= toMinutes(start);
  const minutes = valid ? (toMinutes(end) - toMinutes(start) + 1440) % 1440 || 1440 : 0;

  function build(): Shift | null {
    if (!valid) { setError("Pick a day and both times."); return null; }
    try {
      const startDay = dateInZone(shift.start, zone);
      const unchangedStart = date === startDay && start === timeInZone(shift.start, zone);
      // A finish time left as it was keeps its days after the start, so a shift longer than a day
      // (or one moved to another date) never loses whole days on Save.
      const endTime = end === timeInZone(shift.end, zone);
      const offset = Math.round((Date.parse(`${dateInZone(shift.end, zone)}T12:00:00Z`) - Date.parse(`${startDay}T12:00:00Z`)) / 86400000);
      const endDate = endTime && start === timeInZone(shift.start, zone) ? addDays(date, offset) : nextDay ? addDays(date, 1) : date;
      const unchangedEnd = endDate === dateInZone(shift.end, zone) && endTime;
      const startAt = unchangedStart ? shift.start : zonedInstant(`${date}T${start}`, zone, true);
      const endAt = unchangedEnd ? shift.end : zonedInstant(`${endDate}T${end}`, zone, true);
      if (Date.parse(endAt) <= Date.parse(startAt)) { setError("The finish must be after the start."); return null; }
      const noteList = notes.split("\n").map(n => n.trim()).filter(Boolean);
      const same = startAt === shift.start && endAt === shift.end && JSON.stringify(noteList) === JSON.stringify(shift.notes);
      return same ? shift : { ...shift, start: startAt, end: endAt, notes: noteList, summary: undefined, summaryStatus: undefined, summaryError: undefined };
    } catch (e) { setError(e instanceof Error ? e.message : "Check the times."); return null; }
  }
  function save() {
    setError("");
    const updated = build();
    if (!updated) return;
    // Overlaps and very long shifts are worth a second look; a second tap saves anyway.
    const warnings = shiftWarnings([...shifts.filter(s => s.id !== shift.id), updated]).filter(w => w.ids.includes(updated.id)).map(w => w.message);
    if (warnings.length && JSON.stringify(warnings) !== JSON.stringify(warned)) { setWarned(warnings); return; }
    onSave(updated);
  }

  return <div className={styles.sheetForm}>
    <div className={styles.form}>
      <label className={`${styles.field} ${styles.wide}`}><span>Day</span><input type="date" value={date} onChange={e => { setDate(e.target.value); setWarned(null); }}/></label>
      <label className={styles.field}><span>Started</span><input type="time" value={start} onChange={e => { setStart(e.target.value); setWarned(null); }}/></label>
      <label className={styles.field}><span>Finished{nextDay ? " (next day)" : ""}</span><input type="time" value={end} onChange={e => { setEnd(e.target.value); setWarned(null); }}/></label>
      <label className={`${styles.field} ${styles.wide}`}><span>Notes · one per line</span><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Route, bus, anything worth remembering" maxLength={4000}/></label>
    </div>
    <p className={`${styles.hint} numeric`}>{valid ? `${hm(minutes)} worked` : "Pick a day and both times"} · times in {zone.split("/").pop()?.replaceAll("_", " ")}</p>
    {shift.summary && <div className={styles.summary}>
      <p className={styles.summaryTitle}><Sparkles aria-hidden="true"/> Summary</p>
      <p>{shift.summary.overview}</p>
      {[...shift.summary.activities, ...shift.summary.notable, ...shift.summary.followUp].length > 0 && <ul>{[...shift.summary.activities, ...shift.summary.notable, ...shift.summary.followUp].map((line, i) => <li key={i}>{line}</li>)}</ul>}
    </div>}
    {shift.summaryStatus === "pending" && <p className={styles.hint}><Sparkles aria-hidden="true" className={styles.inlineIcon}/> Writing a summary of your notes…</p>}
    {warned && <div className={styles.warn} role="alert"><TriangleAlert aria-hidden="true"/><div>{warned.map(w => <p key={w}>{w}</p>)}<p className={styles.small}>Tap Save again to keep these times.</p></div></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.sheetActions}>
      {!isNew && <Button variant="danger" icon={<Trash2/>} onClick={() => onDelete(shift)}>Delete</Button>}
      <Button variant="primary" onClick={save}>{warned ? "Save anyway" : "Save"}</Button>
    </div>
  </div>;
}
