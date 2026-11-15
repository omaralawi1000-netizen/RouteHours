"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { shiftWarnings, zonedInstant } from "@/lib/ledger";
import type { Shift } from "@/lib/time";
import { localInput } from "../features/format";

type Props = { shift: Shift; isNew: boolean; initialError?: string; shifts: Shift[]; zone: string; onClose: () => void; onSave: (updated: Shift) => void };

/** Add or edit one shift's times and notes. Open it with a fresh `key` so the fields reset. */
export default function EditShift({ shift, isNew, initialError = "", shifts, zone, onClose, onSave }: Props) {
  const [start, setStart] = useState(() => localInput(shift.start, zone));
  const [end, setEnd] = useState(() => localInput(shift.end, zone));
  const [notes, setNotes] = useState(() => shift.notes.join("\n"));
  const [error, setError] = useState(initialError);
  function save() {
    let startAt: Date, endAt: Date;
    try { startAt = new Date(start === localInput(shift.start, zone) ? shift.start : zonedInstant(start, zone, true)); endAt = new Date(end === localInput(shift.end, zone) ? shift.end : zonedInstant(end, zone, true)); } catch (e) { setError((e as Error).message); return; }
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) { setError("End time must be later than start time."); return; }
    const updated: Shift = { ...shift, start: startAt.toISOString(), end: endAt.toISOString(), notes: notes.split("\n").map(s => s.trim()).filter(Boolean), summary: undefined, summaryStatus: undefined, summaryError: undefined };
    const warnings = shiftWarnings([...shifts.filter(s => s.id !== shift.id), updated]).filter(w => w.ids.includes(updated.id));
    if (warnings.length && !window.confirm(warnings.map(w => w.message).join("\n") + "\nSave these times anyway?")) return;
    onSave(updated);
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Edit shift"><div className="modal-head"><div><h2>{isNew ? "Add a shift" : "Edit shift"}</h2></div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={19}/></button></div><p className="report-hint">{isNew ? "These are suggested times. Check the date and both times before saving." : "Review your recorded times."} Times in {zone}.</p><label>Start date & time<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}/></label><label>End date & time<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}/></label><label>Notes <small>One note per line. Avoid identifying children.</small><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}/></label>{error && <p className="form-error">{error}</p>}<button className="modal-submit" onClick={save}>Save shift <ArrowRight size={17}/></button></div></div>;
}
