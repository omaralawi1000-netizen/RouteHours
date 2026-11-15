"use client";

import { ArrowRight, Check, ChevronRight, MessageCircle, Mic, MicOff, Play, Plus, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { durationLabel, minutesBetween, type ActiveShift, type Shift } from "@/lib/time";
import type { Assistant } from "../features/use-assistant";
import type { Dictation, DictationTarget } from "../features/use-dictation";
import { useNow } from "../features/use-now";
import { clock, cleanNoteDraft, formatDay, formatTime } from "../features/format";
import type { Backups } from "../features/use-backups";

type Props = {
  active: ActiveShift | null;
  noteDraft: string;
  onNoteDraft: (value: string) => void;
  onActive: (value: ActiveShift) => void;
  zone: string;
  today: string;
  saveStatus: string;
  savedShift?: Shift;
  lastShift?: Shift;
  weekMinutes: number;
  weekShiftCount: number;
  weeklyGoalHours: number;
  timerCheckedAt: number;
  onTimerChecked: (at: number) => void;
  dictation: Dictation;
  assistant: Assistant;
  hasAiKey: boolean;
  backups: Backups;
  showDailyBackup: boolean;
  online: boolean;
  onStart: () => void;
  onFinish: () => void;
  onAddNote: () => void;
  onUndo: () => void;
  onEdit: (shift?: Shift) => void;
  onWeek: () => void;
  onSettings: (section?: "profile" | "connections" | "backups") => void;
  onVoicePlan: (text: string) => void;
};

export default function TodayScreen(p: Props) {
  const { active, dictation, assistant, zone, savedShift, lastShift } = p;
  const noteMicActive = dictation.isActiveFor("general");
  const askMicActive = dictation.isActiveFor("assistant");
  return <div className="today-view">
    <div className="page-heading"><h1>{active ? "Shift in progress" : savedShift ? "Shift saved" : "Ready when you are"}</h1><p className="page-date">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(p.today + "T12:00:00Z"))}</p></div>
    <section id="timer" className={`timer-card ${active ? "is-active" : ""}`} aria-label="Shift timer">
      <div className="timer-card-top"><span className="card-kicker"><span className="status-dot"/>{active ? "Recording time" : "Ready"}</span><span className="timer-zone">{zone.split("/").pop()?.replaceAll("_", " ")}</span></div>
      <div className="timer-center"><TimerDigits start={active?.start}/><span className="timer-sub">{active ? `Started at ${formatTime(active.start, zone)}` : "Start when you get on the bus"}</span></div>
      {active && <div className="inline-note"><div className="note-label"><strong>Quick note</strong><span>Private by default</span></div><div className="note-compose"><textarea id="quick-note-input" aria-label="Shift note" value={p.noteDraft} onChange={e => p.onNoteDraft(e.target.value)} placeholder="Anything worth remembering?" maxLength={2000}/><button type="button" className={`assistant-mic ${noteMicActive ? "is-active" : ""}`} aria-label={noteMicActive ? "Stop note recording" : "Dictate a note"} aria-pressed={noteMicActive} disabled={dictation.transcribing || dictation.micStarting || (dictation.recording || dictation.listening) && dictation.target !== "general"} onClick={() => dictation.toggle("general")}>{dictation.recording || dictation.listening ? <MicOff size={20}/> : <Mic size={20}/>}</button></div><VoiceStatus dictation={dictation} target="general"/><div className="note-tools"><button className="text-action" onClick={() => { assistant.setOpen(true); document.getElementById("help-panel")?.setAttribute("open", ""); document.getElementById("assistant")?.scrollIntoView({ behavior: "smooth" }); }}>Help with a note <Sparkles size={13}/></button><button className="text-action" disabled={!cleanNoteDraft(p.noteDraft)} onClick={p.onAddNote}><Plus size={15}/> Save note</button></div>{active.notes.length > 0 && <details className="saved-notes"><summary>{active.notes.length} saved {active.notes.length === 1 ? "note" : "notes"}</summary>{active.notes.map((n, i) => <div className="note-item" key={i}><p>{n}</p><button className="icon-btn" aria-label="Remove note" onClick={() => p.onActive({ ...active, notes: active.notes.filter((_, j) => j !== i) })}><X size={15}/></button></div>)}</details>}</div>}
      {active && <LongShiftCheck start={active.start} checkedAt={p.timerCheckedAt} onChecked={p.onTimerChecked}/>}
      <button className={`timer-button ${active ? "stop" : "start"}`} disabled={dictation.recording || dictation.listening || dictation.transcribing || dictation.micStarting} onClick={active ? p.onFinish : p.onStart}>{active ? <><span className="stop-square"/> Finish shift</> : <><Play size={18} fill="currentColor"/> Start shift</>}</button>
      <div className="timer-foot"><ShieldCheck size={14}/>{p.saveStatus}</div>
    </section>
    {savedShift && <section className="saved-confirmation" aria-live="polite"><div className="confirmation-icon"><Check size={21}/></div><div><strong>Shift saved · {durationLabel(minutesBetween(savedShift.start, savedShift.end))}</strong><p>{formatTime(savedShift.start, zone)} – {formatTime(savedShift.end, zone)}{savedShift.summaryStatus === "pending" && <span> · Preparing summary</span>}</p></div><button onClick={() => p.onEdit(savedShift)}>Correct</button><button disabled={Boolean(active)} onClick={p.onUndo}>Undo</button></section>}
    {!active && !savedShift && lastShift && <button className="last-shift-row" onClick={() => p.onEdit(lastShift)}><span className="row-icon"><Check size={18}/></span><span><strong>Last shift</strong><small>{formatDay(lastShift.start, zone)} · {formatTime(lastShift.start, zone)}–{formatTime(lastShift.end, zone)}</small></span><b>{durationLabel(minutesBetween(lastShift.start, lastShift.end))}</b><ArrowRight size={16}/></button>}
    <button className="week-peek" onClick={p.onWeek}><span><span className="week-peek-label">This week</span><strong>{durationLabel(p.weekMinutes)}</strong></span><span>{p.weeklyGoalHours ? `of ${p.weeklyGoalHours}h goal` : `${p.weekShiftCount} shifts`}<ArrowRight size={18}/></span></button>
    {p.showDailyBackup && <DailyBackupPeek backups={p.backups} online={p.online} onOpen={() => p.onSettings("backups")}/>}
    <details id="help-panel" className="help-panel"><summary><span><Sparkles size={18}/> Ask or log with your voice</span><Plus size={17}/></summary><section id="assistant" className="assistant-card surface" aria-label="Ask RouteHours"><div className="assistant-heading"><span className="assistant-icon"><MessageCircle size={22}/></span><div><h2>A little help.</h2><p>Ask by voice or type. Get help with the app or with structuring a note.</p></div></div><details className="assistant-help"><summary>Suggested questions</summary><div className="assistant-prompts"><button onClick={() => void assistant.ask("How do I export and email my hours?")}>Export & email</button><button onClick={() => void assistant.ask("How should I structure a useful shift note?")}>Structure a note</button><button onClick={() => void assistant.ask("How do I set up Google Sheets?")}>Set up Sheets</button></div></details><form className="assistant-form" onSubmit={e => { e.preventDefault(); void assistant.ask(); }}><input value={assistant.question} onChange={e => assistant.setQuestion(e.target.value)} maxLength={1200} placeholder={askMicActive ? "Listening to your question…" : "Ask a question or describe your hours…"} aria-label="Question for RouteHours"/><button type="button" className={`assistant-mic ${askMicActive ? "is-active" : ""}`} aria-label={askMicActive ? "Stop question recording" : "Dictate a question"} aria-pressed={askMicActive} disabled={dictation.transcribing || dictation.micStarting || (dictation.recording || dictation.listening) && dictation.target !== "assistant"} onClick={() => dictation.toggle("assistant")}>{askMicActive ? <MicOff size={18}/> : <Mic size={18}/>}</button><button type="submit" className="assistant-send" disabled={!assistant.question.trim() || assistant.busy} aria-label="Ask question"><Send size={18}/></button></form><button className="text-action" disabled={!assistant.question.trim()} onClick={() => p.onVoicePlan(assistant.question)}><Sparkles size={15}/> Turn these words into hours</button><VoiceStatus dictation={dictation} target="assistant"/>{(assistant.open || assistant.busy) && <div className="assistant-reply" aria-live="polite"><div><Sparkles size={17}/><strong>RouteHours guide</strong>{assistant.busy && <span className="mini-spinner"/>}</div>{assistant.busy ? <p>Thinking through your question…</p> : assistant.error ? <p className="assistant-error">{assistant.error} {!p.hasAiKey && <button onClick={() => p.onSettings()}>Open Settings</button>}</p> : <p>{assistant.answer}</p>}</div>}<small>For note help, your active note draft is sent to Gemini with your question. Leave out identifying details.</small></section></details>
    {!active && <button className="text-action add-past" onClick={() => p.onEdit()}><Plus size={16}/> Add a past shift</button>}
  </div>;
}

/** The only part of Today that updates every second. */
function TimerDigits({ start }: { start?: string }) {
  const now = useNow(1000, Boolean(start));
  const seconds = start ? Math.max(0, Math.floor((now - Date.parse(start)) / 1000)) : 0;
  return <div className="timer-digits" aria-live="off">{start ? clock(seconds) : "00:00:00"}</div>;
}

/** After 12 hours, ask whether the shift is really still running (at most once an hour). */
function LongShiftCheck({ start, checkedAt, onChecked }: { start: string; checkedAt: number; onChecked: (at: number) => void }) {
  const now = useNow(30_000);
  const seconds = Math.max(0, Math.floor((now - Date.parse(start)) / 1000));
  if (!(seconds > 12 * 3600 && now - checkedAt > 3600000)) return null;
  return <div className="review-warning"><strong>Still working?</strong><p>This timer has passed 12 hours. Finish and correct the time if you forgot to stop it.</p><button onClick={() => onChecked(Date.now())}>Yes, keep counting</button></div>;
}

export function VoiceStatus({ dictation, target }: { dictation: Dictation; target: DictationTarget }) {
  const { recording, listening, micStarting, transcribing, audioLevel, recordSeconds } = dictation;
  if (dictation.target !== target || !(recording || listening || micStarting || transcribing)) return null;
  return <div className="assistant-listening" role="status"><span className={`assistant-mini-wave ${listening ? "recognizing" : ""}`} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ transform: `scaleY(${(4 + audioLevel * (23 - Math.abs(i - 3) * 4)) / 27})` }}/>)}</span><span>{transcribing ? "Turning speech into text…" : micStarting ? "Opening microphone…" : recording ? `Listening · ${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")} · tap mic to finish` : "Listening… speak now"}</span></div>;
}

function DailyBackupPeek({ backups, online, onOpen }: { backups: Backups; online: boolean; onOpen: () => void }) {
  const daily = backups.dailyBackup;
  return <button className="backup-peek" onClick={onOpen}><ShieldCheck size={16}/><span>{daily.saving ? "Saving daily backup…" : daily.error ? "Daily backup needs attention" : !daily.due ? "Daily backup saved" : daily.needsConnection ? "Continue daily backup" : !online ? "Daily backup waiting for internet" : "Daily backup ready"}</span><ChevronRight size={15}/></button>;
}
