"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shift } from "@/lib/time";
import { templateShift } from "@/lib/templates";
import { dateInZone } from "@/lib/ledger";
import { useAppData } from "../state/app-data";
import { cleanNoteDraft } from "../features/format";
import type { Break } from "../ui/shift-line";
import type { ToastMessage } from "../ui/toast";
import { tick } from "../ui/haptics";
import { hm, partsFrom } from "./usual";

/**
 * A "run" is one stretch on the road, from Start to Finish. A break saves the part driven so far as
 * its own shift and pauses; Resume starts the next part. So breaks never change the saved data
 * format: the timesheet just sees two shifts, like a split day. The run itself (which part of the
 * usual day, the pieces before a break, "still driving") lives on this phone only.
 */
/** The shift a note belongs to: the running part (by its start) or a saved shift. */
export type NoteTarget = { activeStart?: string; shiftId?: string };
export type Run = { startedAt: string; label?: string; pieces: string[]; breakSince?: string; stillDriving?: boolean };
export type Phase = "idle" | "running" | "landing";
const RUN_KEY = "routehours:run";
/** A break longer than this ends the run: the driver went home. */
const LONGEST_BREAK = 6 * 3600000;

function readRun(): Run | null {
  try { const run = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null"); return run && typeof run.startedAt === "string" && Array.isArray(run.pieces) ? run : null; } catch { return null; }
}
function writeRun(run: Run | null) {
  try { if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run)); else localStorage.removeItem(RUN_KEY); } catch { /* kept for this visit */ }
}

type Say = (text: string, action?: ToastMessage["action"]) => void;

export function useRun(say: Say) {
  const { data, loaded, update, isBlocked } = useAppData();
  const { active, shifts, workZone, templates, aiEnabled, geminiApiKey, accessCode } = data;
  const [run, setRunState] = useState<Run | null>(null);
  const [landing, setLanding] = useState<{ startedAt: number; endedAt: number; breaks: Break[] } | null>(null);
  const latest = useRef(data); latest.current = data;
  const setRun = useCallback((next: Run | null) => { setRunState(next); writeRun(next); }, []);
  const willSummarize = aiEnabled && Boolean(geminiApiKey || accessCode);

  // Line the run up with the saved timer once the records have loaded (or changed in another tab).
  useEffect(() => {
    if (!loaded) return;
    const saved = readRun();
    if (active) {
      const begun = Date.parse(active.start);
      // The saved run belongs to this timer if it began with it, or if this timer is the part after its break.
      const sameStart = saved && saved.startedAt === active.start;
      const afterBreak = saved && saved.pieces.length > 0 && Date.parse(saved.startedAt) <= begun && begun - Date.parse(saved.startedAt) < 16 * 3600000;
      if (saved && (sameStart || afterBreak)) { if (saved.breakSince) setRun({ ...saved, breakSince: undefined }); else setRunState(saved); }
      else setRun({ startedAt: active.start, pieces: [] });
    } else if (saved?.breakSince && Date.now() - Date.parse(saved.breakSince) < LONGEST_BREAK) setRunState(saved);
    else if (saved) setRun(null);
  }, [loaded, active?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const pieces = useMemo(() => (run?.pieces ?? []).map(id => shifts.find(s => s.id === id)).filter((s): s is Shift => Boolean(s)).sort((a, b) => a.start.localeCompare(b.start)), [run?.pieces, shifts]);
  const onBreak = !active && Boolean(run?.breakSince);
  const running = Boolean(active) || onBreak;
  const startedAt = run ? Date.parse(run.startedAt) : active ? Date.parse(active.start) : 0;
  // The gaps between the pieces are the breaks; an open break runs from the last piece's end.
  const breaks = useMemo<Break[]>(() => {
    const list: Break[] = [];
    pieces.forEach((piece, i) => {
      const next = pieces[i + 1]?.start ?? (active ? active.start : undefined);
      list.push({ start: Date.parse(piece.end), end: next ? Date.parse(next) : undefined });
    });
    if (onBreak && !pieces.length && run?.breakSince) list.push({ start: Date.parse(run.breakSince) });
    return list;
  }, [pieces, active, onBreak, run?.breakSince]);

  function pieceFrom(end: number): Shift | null {
    const current = latest.current.active;
    if (!current) return null;
    const draft = cleanNoteDraft(latest.current.noteDraft);
    const notes = draft ? [...current.notes, draft] : current.notes;
    const endAt = Math.max(end, Date.parse(current.start) + 60_000);
    return { id: crypto.randomUUID(), start: current.start, end: new Date(endAt).toISOString(), notes, summaryStatus: willSummarize && notes.length ? "pending" : undefined };
  }

  function start(label?: string) {
    if (latest.current.active || isBlocked()) return;
    tick();
    const now = new Date().toISOString();
    update({ active: { start: now, notes: [] }, noteDraft: "" });
    setRun({ startedAt: now, label, pieces: [] });
    setLanding(null);
  }

  function toggleBreak() {
    tick();
    if (onBreak && run) {
      // A very short first part is saved as one minute, so the next part never starts before it ends.
      const resumeAt = Math.max(Date.now(), run.breakSince ? Date.parse(run.breakSince) : 0);
      update({ active: { start: new Date(resumeAt).toISOString(), notes: [] }, noteDraft: "" });
      setRun({ ...run, breakSince: undefined });
      say("Back on the road");
      return;
    }
    const piece = pieceFrom(Date.now());
    if (!piece || !run) return;
    update(current => ({ shifts: [piece, ...current.shifts], active: null, noteDraft: "" }));
    setRun({ ...run, pieces: [...run.pieces, piece.id], breakSince: piece.end });
    say(`Break started. ${hm((Date.parse(piece.end) - Date.parse(piece.start)) / 60000)} saved so far.`);
  }

  /** Finish now, or at `at` (auto-finish logs the usual end). */
  function finish(at?: number, message?: string) {
    if (!run && !latest.current.active) return;
    tick();
    const saved = run;
    const piece = latest.current.active ? pieceFrom(at ?? Date.now()) : null;
    if (piece) update(current => ({ shifts: [piece, ...current.shifts], active: null, noteDraft: "" }));
    const all = [...pieces, ...(piece ? [piece] : [])];
    const minutes = all.reduce((sum, s) => sum + Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000), 0);
    const endedAt = piece ? Date.parse(piece.end) : saved?.breakSince ? Date.parse(saved.breakSince) : Date.now();
    setLanding({ startedAt, endedAt, breaks: breaks.filter(b => b.end) });
    setRun(null);
    window.setTimeout(() => setLanding(current => current?.endedAt === endedAt ? null : current), 1100);
    say(message ?? `Shift saved · ${hm(minutes)}`, { label: "Undo", onClick: () => undoFinish(piece, saved) });
  }

  function undoFinish(piece: Shift | null, saved: Run | null) {
    if (latest.current.active) { say("A shift is already running"); return; }
    if (piece) {
      const current = latest.current.shifts.find(s => s.id === piece.id);
      if (!current) { say("That shift was already changed"); return; }
      update(data => ({ shifts: data.shifts.filter(s => s.id !== current.id), active: { start: current.start, notes: current.notes } }));
      setRun(saved ? { ...saved, breakSince: undefined } : { startedAt: current.start, pieces: [] });
    } else if (saved) setRun(saved);
    setLanding(null);
    say("Shift resumed");
  }

  /** "Started at 06:45?": move the start back to when the run usually begins. */
  function backdate(at: number, label: string) {
    const current = latest.current.active;
    if (!current || !run || run.pieces.length) return;
    const iso = new Date(at).toISOString();
    update({ active: { ...current, start: iso } });
    setRun({ ...run, startedAt: iso });
    say(`Start moved to ${label}`);
  }
  function keepDriving() { if (run) setRun({ ...run, stillDriving: true }); say("Got it. It won't finish on its own this run."); }

  /** Logs the whole usual day at once, for a day you forgot to press Start. */
  function logUsualDay(date = dateInZone(Date.now(), workZone)) {
    tick();
    let made: Shift[];
    try { made = partsFrom(templates).map(part => templateShift(templates.find(t => t.id === part.id)!, date, workZone)); }
    catch (error) { say(error instanceof Error ? error.message : "Check your usual shift times in Settings"); return; }
    if (!made.length) { say("Add your usual shifts in Settings first"); return; }
    const ids = new Set(made.map(s => s.id));
    update(current => ({ shifts: [...made, ...current.shifts] }));
    const minutes = made.reduce((sum, s) => sum + Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000), 0);
    say(`Usual day logged · ${hm(minutes)}`, { label: "Undo", onClick: () => { update(current => ({ shifts: current.shifts.filter(s => !ids.has(s.id)) })); say("Removed"); } });
  }

  /** Where a note would go right now: the running part, or the last shift. Kept while a voice note is written down. */
  function noteTarget(): NoteTarget | null {
    const current = latest.current.active;
    if (current) return { activeStart: current.start };
    const last = pieces.at(-1) ?? latest.current.shifts.slice().sort((a, b) => b.start.localeCompare(a.start))[0];
    return last ? { shiftId: last.id } : null;
  }

  function addNote(text: string, target?: NoteTarget | null) {
    const note = text.trim();
    if (!note) return false;
    const current = latest.current.active;
    if (target) {
      // A part that has since been saved keeps its start, so the note still finds it.
      if (current && target.activeStart === current.start) { update({ active: { ...current, notes: [...current.notes, note] } }); return true; }
      const shift = latest.current.shifts.find(s => target.shiftId ? s.id === target.shiftId : s.start === target.activeStart);
      if (shift) { update(data => ({ shifts: data.shifts.map(s => s.id === shift.id ? withNote(s, note) : s) })); return true; }
    }
    if (current) { update({ active: { ...current, notes: [...current.notes, note] } }); return true; }
    const last = pieces.at(-1) ?? latest.current.shifts.slice().sort((a, b) => b.start.localeCompare(a.start))[0];
    if (!last) return false;
    update(data => ({ shifts: data.shifts.map(s => s.id === last.id ? withNote(s, note) : s) }));
    return true;
  }

  /** A saved shift's summary was written from its old notes, so a new note clears it (and queues a new one when summaries are on). */
  function withNote(shift: Shift, note: string): Shift {
    return { ...shift, notes: [...shift.notes, note], summary: undefined, summaryError: undefined, summaryStatus: willSummarize ? "pending" : undefined };
  }

  /** After records are replaced from a backup: forget a paused run that pointed at the old records. A restored timer lines up again on its own. */
  function reset() { setRun(null); setLanding(null); }

  const phase: Phase = running ? "running" : landing ? "landing" : "idle";
  return {
    phase, running, onBreak, active, run, label: run?.label, stillDriving: Boolean(run?.stillDriving),
    startedAt: landing && !running ? landing.startedAt : startedAt, endedAt: landing?.endedAt ?? 0,
    breaks: landing && !running ? landing.breaks : breaks, pieces,
    start, finish, toggleBreak, backdate, keepDriving, logUsualDay, addNote, noteTarget, reset,
  };
}
export type RunControls = ReturnType<typeof useRun>;
