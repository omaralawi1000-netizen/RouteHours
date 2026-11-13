"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion/mini";
import { ArrowRight, CalendarDays, Clock3, Download, FileSpreadsheet, Info, Moon, Settings2, Sun, X } from "lucide-react";
import WeeklyExport from "../weekly-export";
import VoiceReview from "../voice-review";
import OfflineStatus, { useOnlineStatus } from "../offline-status";
import { useGoogleSession } from "../use-google-session";
import { AppDataProvider, useAppData } from "../state/app-data";
import { useToday } from "../features/use-now";
import { useDictation, type DictationTarget } from "../features/use-dictation";
import { useAssistant } from "../features/use-assistant";
import { useSheetExport } from "../features/use-sheet-export";
import { useBackups } from "../features/use-backups";
import { useInstall } from "../features/use-install";
import { useTheme } from "../features/use-theme";
import { useShiftSummaries } from "../features/use-shift-summaries";
import { download } from "../features/download";
import { cleanNoteDraft, formatDay } from "../features/format";
import TodayScreen from "../screens/today-screen";
import WeekScreen, { type HistoryRange } from "../screens/week-screen";
import SettingsSheet, { type SettingsSection } from "../screens/settings-sheet";
import { LoadingScreen, RecoveryScreen } from "../screens/boot-screens";
import EditShift from "../sheets/edit-shift";
import ShareSheet from "../sheets/share-sheet";
import RestoreSheet from "../sheets/restore-sheet";
import InstallSheet from "../sheets/install-sheet";
import StorageError from "../sheets/storage-error";
import { addDays, mondayOf, periodMinutes, zonedInstant } from "@/lib/ledger";
import { normalizeGoogleClientId } from "@/lib/google-auth";
import { isTimeRequest } from "@/lib/voice-plan";
import { interpretVoice } from "@/lib/voice";
import { durationLabel, minutesBetween, shiftsCsv, type ActiveShift, type Shift } from "@/lib/time";

type VoiceAction = { kind: "start" | "stop"; transcript: string };
type Editing = { shift: Shift; error?: string; key: number };

export default function Page() {
  return <AppDataProvider><Home/></AppDataProvider>;
}

function Home() {
  const online = useOnlineStatus();
  const { data, loaded, bootError, setBootError, saveStatus, storageError, isBlocked, update } = useAppData();
  const { shifts, active, noteDraft, workZone, payroll, dayDetails, templates, weeklyGoalHours, aiEnabled, geminiApiKey, accessCode, groqApiKey, dictationLanguage, googleClientId, themeMode } = data;
  const today = useToday(workZone);
  const currentMonday = mondayOf(today);
  const [view, setView] = useState<"today" | "history">("today");
  const [selectedWeek, setSelectedWeek] = useState(currentMonday);
  const [lastSavedShift, setLastSavedShift] = useState<Shift | null>(null);
  const [voicePlanText, setVoicePlanText] = useState<string | null>(null);
  const [voiceAction, setVoiceAction] = useState<VoiceAction | null>(null);
  const [timerCheckedAt, setTimerCheckedAt] = useState(0);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  const [weeklyExportOpen, setWeeklyExportOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const activeRef = useRef<ActiveShift | null>(null);
  activeRef.current = active;
  const closeWeeklyExport = useCallback(() => setWeeklyExportOpen(false), []);
  const effectiveClientId = normalizeGoogleClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const googleConnection = useGoogleSession(effectiveClientId, "google");
  const isDarkTheme = useTheme(themeMode, loaded);
  const install = useInstall();

  function openSettings(section: SettingsSection = "profile") { setSettingsSection(section); setSettingsOpen(true); }
  const backups = useBackups({ clientId: effectiveClientId, online, today, onNotice: setNotice, onRestored: () => setLastSavedShift(null) });
  const sheet = useSheetExport({ shifts, googleClientId, onNotice: setNotice, onNeedSettings: message => { setSettingsOpen(true); setNotice(message); }, onBegin: () => setExportOpen(false) });
  useShiftSummaries({ loaded, aiEnabled, geminiApiKey, accessCode, shifts, update, onNotice: setNotice });

  // Week totals only change when shifts or the date change, never on a clock tick.
  const sorted = useMemo(() => shifts.slice().sort((a, b) => b.start.localeCompare(a.start)), [shifts]);
  const savedShift = lastSavedShift ? shifts.find(shift => shift.id === lastSavedShift.id) : undefined;
  const weekStart = Date.parse(zonedInstant(currentMonday + "T00:00", workZone)), weekEnd = Date.parse(zonedInstant(addDays(currentMonday, 7) + "T00:00", workZone));
  const weekShiftCount = useMemo(() => shifts.filter(s => Date.parse(s.start) < weekEnd && Date.parse(s.end) > weekStart).length, [shifts, weekStart, weekEnd]);
  const weekMinutes = useMemo(() => periodMinutes(shifts, currentMonday, addDays(currentMonday, 7), workZone), [shifts, currentMonday, workZone]);
  const monthStart = today.slice(0, 7) + "-01";
  const monthMinutes = useMemo(() => { const next = new Date(monthStart + "T12:00Z"); next.setUTCMonth(next.getUTCMonth() + 1); return periodMinutes(shifts, monthStart, next.toISOString().slice(0, 10), workZone); }, [shifts, monthStart, workZone]);

  const assistant = useAssistant({ geminiKey: geminiApiKey, accessCode, context: asked => {
    const aboutNote = /note|structur|summar|word|write|formul|skriv|notat|ملاحظ/i.test(asked);
    const current = activeRef.current;
    return `Active shift: ${current ? "yes" : "no"}. Saved shifts: ${shifts.length}. This week: ${durationLabel(weekMinutes)}. This month: ${durationLabel(monthMinutes)}.${aboutNote && current ? ` Current note draft: ${noteDraft.slice(0, 1200) || "empty"}. Saved notes in active shift: ${current.notes.join(" | ").slice(0, 1000) || "none"}.` : ""}`;
  } });
  const dictation = useDictation({ groqKey: groqApiKey, language: dictationLanguage, onTranscript: acceptVoiceTranscript, onNotice: setNotice, onStart: () => setVoiceAction(null) });

  useEffect(() => { if (loaded) setSelectedWeek(mondayOf(today)); }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 6000); return () => window.clearTimeout(timer); }, [notice]);
  useModalFocus({ editingId: editing?.shift.id, settingsOpen, shareOpen: sheet.shareOpen, weeklyExportOpen, installOpen: install.instructionsOpen, voicePlanOpen: voicePlanText !== null, restoreOpen: backups.restorePreview !== null, storageError, creatingSheet: sheet.creating, onEscape: () => {
    if (backups.restorePreview) backups.setRestorePreview(null); else if (voicePlanText !== null) setVoicePlanText(null); else if (install.instructionsOpen) install.setInstructionsOpen(false); else if (settingsOpen) setSettingsOpen(false); else if (sheet.shareOpen) sheet.setShareOpen(false); else setEditing(null);
  } });

  useEffect(() => {
    if (!loaded) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const panel = document.querySelector(".today-view, .week-layout");
    if (!panel) return;
    const transition = animate(panel, { opacity: [.7, 1], transform: ["translateY(6px)", "translateY(0)"], filter: ["blur(1px)", "blur(0)"] }, { duration: .24, ease: [0.16, 1, 0.3, 1] });
    return () => transition.stop();
  }, [loaded, view]);
  useEffect(() => {
    if (!loaded || !active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const digits = document.querySelector(".timer-digits");
    if (!digits) return;
    const transition = animate(digits, { transform: ["scale(.97)", "scale(1)"], filter: ["blur(2px)", "blur(0px)"] }, { duration: .3, ease: [0.16, 1, 0.3, 1] });
    return () => transition.stop();
  }, [loaded, active?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const modals = document.querySelectorAll(".modal");
    const animations = Array.from(modals).map(modal => animate(modal, { opacity: [.7, 1], transform: ["translateY(24px)", "translateY(0)"] }, { duration: .3, ease: [0.16, 1, 0.3, 1] }));
    return () => animations.forEach(animation => animation.stop());
  }, [settingsOpen, sheet.shareOpen, weeklyExportOpen, editing, install.instructionsOpen, voicePlanText !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function startShift() {
    if (active || isBlocked()) return;
    setLastSavedShift(null); update({ active: { start: new Date().toISOString(), notes: [] }, noteDraft: "" });
    setNotice("Shift started. Your timer will keep its place if you close this tab.");
  }
  function stopShift() {
    if (!active) return;
    const end = new Date().toISOString();
    const draft = cleanNoteDraft(noteDraft);
    const notes = draft ? [...active.notes, draft] : active.notes;
    const willSummarize = aiEnabled && Boolean(geminiApiKey || accessCode);
    const shift: Shift = { id: crypto.randomUUID(), start: active.start, end, notes, summaryStatus: willSummarize ? "pending" : undefined };
    update(current => ({ shifts: [shift, ...current.shifts], active: null, noteDraft: "" })); setLastSavedShift(shift);
    setExpanded(shift.id);
    setNotice("");
  }
  function addNote() {
    const note = cleanNoteDraft(noteDraft);
    if (!note || !active) return;
    update({ active: { ...active, notes: [...active.notes, note] }, noteDraft: "" });
  }
  function undoSavedShift() {
    if (active || !savedShift) return;
    const current = shifts.find(s => s.id === savedShift.id);
    if (!current) { setLastSavedShift(null); return; }
    update(data => ({ shifts: data.shifts.filter(s => s.id !== current.id), active: { start: current.start, notes: current.notes } }));
    setLastSavedShift(null); setNotice("Timer resumed from its recorded start.");
  }
  async function copyShiftHours(shift: Shift) {
    const minutes = minutesBetween(shift.start, shift.end);
    const text = `RouteHours · ${formatDay(shift.start, workZone)}\nStart: ${new Date(shift.start).toLocaleString("en-GB", { timeZone: workZone })}\nEnd: ${new Date(shift.end).toLocaleString("en-GB", { timeZone: workZone })}\nHours: ${durationLabel(minutes)} (${(minutes / 60).toFixed(2)} decimal hours)`;
    try { await navigator.clipboard.writeText(text); setNotice("Shift hours copied. You can paste them into a message."); }
    catch { setNotice("Clipboard unavailable. You can still use Export → Download hours CSV."); }
  }
  function handleVoiceTranscript(transcript: string) {
    const heard = transcript.trim();
    if (!heard) { setNotice("No speech was heard. Tap the microphone and try again."); return; }
    if (isTimeRequest(heard)) { setVoicePlanText(heard); return; }
    const intent = interpretVoice(heard);
    if (intent.kind === "start" || intent.kind === "stop") setVoiceAction({ kind: intent.kind, transcript: heard });
    else if (intent.kind === "help") {
      assistant.setOpen(true);
      assistant.setQuestion(intent.question);
      void assistant.ask(intent.question);
    } else if (intent.kind === "logHours") {
      const hours = intent.hours;
      if (hours > 0 && hours <= 24) {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 3600000);
        openEdit({ id: crypto.randomUUID(), start: start.toISOString(), end: end.toISOString(), notes: [] }, undefined, "Review the suggested times before saving. The app only heard a duration, so it assumed the shift ended now.");
      } else setNotice("Say a duration between 0 and 24 hours.");
    } else if (intent.kind === "note" && activeRef.current) {
      const note = intent.text;
      update(current => ({ noteDraft: current.noteDraft.trim() ? `${current.noteDraft.trim()} ${note}` : note }));
      setNotice("Dictation added to your note draft. Review it, then tap Add note or stop the shift.");
    } else setNotice("Start a shift first to dictate a note, or say ‘log 2 hours’ for a manual entry.");
  }
  function acceptVoiceTranscript(transcript: string, target: DictationTarget) {
    if (target !== "assistant") { handleVoiceTranscript(transcript); return; }
    const heard = transcript.trim();
    if (!heard) { setNotice("No speech was heard. Tap the mic and try again."); return; }
    if (isTimeRequest(heard)) { setVoicePlanText(heard); return; }
    const intent = interpretVoice(heard);
    if (intent.kind === "start" || intent.kind === "stop" || intent.kind === "logHours" || /^(add|take|write)( a)? note\b/i.test(heard)) { handleVoiceTranscript(heard); return; }
    assistant.setQuestion(heard.slice(0, 1200));
    setNotice("Question ready. Review it, then tap Send.");
  }
  function confirmVoiceAction() {
    if (!voiceAction) return;
    if (voiceAction.kind === "start") { if (!active) startShift(); else setNotice("A shift is already running."); }
    else { if (active) stopShift(); else setNotice("There is no active shift to stop."); }
    setVoiceAction(null);
  }
  function openEdit(shift?: Shift, selectedDate?: string, error?: string) {
    const value = shift || (selectedDate ? { id: crypto.randomUUID(), start: zonedInstant(selectedDate + "T07:00", workZone, true), end: zonedInstant(selectedDate + "T09:00", workZone, true), notes: [] } : emptyShift());
    setEditing(current => ({ shift: value, error, key: (current?.key ?? 0) + 1 }));
  }
  function saveEdit(updated: Shift) {
    update(current => ({ shifts: current.shifts.some(s => s.id === updated.id) ? current.shifts.map(s => s.id === updated.id ? updated : s) : [updated, ...current.shifts] }));
    if (lastSavedShift?.id === updated.id) setLastSavedShift(updated);
    setEditing(null); setNotice("Shift saved. Generate the summary again if details changed.");
  }
  function retrySummary(shift: Shift) {
    if (!(geminiApiKey || accessCode) || !aiEnabled) { setSettingsOpen(true); return; }
    update(current => ({ shifts: current.shifts.map(s => s.id === shift.id ? { ...s, summaryStatus: "pending", summaryError: undefined } : s) }));
  }
  function deleteShift(id: string) {
    if (!window.confirm("Delete this shift? This cannot be undone unless you have a backup.")) return;
    update(current => ({ shifts: current.shifts.filter(s => s.id !== id) })); if (lastSavedShift?.id === id) setLastSavedShift(null);
  }
  function exportCsv(detailed: boolean) {
    if (!shifts.length) return;
    download(`routehours-${today.slice(0, 7)}${detailed ? "-detailed" : "-hours"}.csv`, shiftsCsv(shifts, detailed, workZone), "text/csv;charset=utf-8");
    setExportOpen(false);
  }
  function focusGoogleSetup() {
    setSettingsSection("connections");
    requestAnimationFrame(() => {
      const field = document.getElementById("google-client-id");
      field?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      field?.focus({ preventScroll: true });
    });
  }

  if (bootError) return <RecoveryScreen message={bootError} onError={setBootError}/>;
  if (!loaded) return <LoadingScreen/>;

  return <div className="app-shell">

    <header className="topbar container">
      <div className="brand"><img className="brand-mark" src="/icon-192-v3.png" alt="" width="37" height="37"/><div><strong>RouteHours</strong><span>Your time, simply.</span></div></div>
      <div className="top-actions"><span className="today-pill"><CalendarDays size={15}/>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span>{!install.installed && <button className="install-top" onClick={() => void install.install()}><Download size={16}/> Install</button>}<button className="icon-btn theme-button" aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} onClick={() => update({ themeMode: isDarkTheme ? "light" : "dark" })}>{isDarkTheme ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button></div>
    </header>

    <OfflineStatus online={online}/>
    <main className="container main-grid" data-view={view}>
      {view === "today" ? <TodayScreen active={active} noteDraft={noteDraft} onNoteDraft={value => update({ noteDraft: value })} onActive={value => update({ active: value })} zone={workZone} today={today} saveStatus={saveStatus} savedShift={savedShift} lastShift={sorted[0]} weekMinutes={weekMinutes} weekShiftCount={weekShiftCount} weeklyGoalHours={weeklyGoalHours} timerCheckedAt={timerCheckedAt} onTimerChecked={setTimerCheckedAt} dictation={dictation} assistant={assistant} hasAiKey={Boolean(geminiApiKey || accessCode)} backups={backups} showDailyBackup={backups.dailyEnabled && Boolean(effectiveClientId)} online={online} onStart={startShift} onFinish={stopShift} onAddNote={addNote} onUndo={undoSavedShift} onEdit={shift => openEdit(shift)} onWeek={() => { setSelectedWeek(currentMonday); setView("history"); }} onSettings={section => section ? openSettings(section) : setSettingsOpen(true)} onVoicePlan={setVoicePlanText}/>
        : <WeekScreen week={selectedWeek} onWeek={setSelectedWeek} shifts={shifts} sorted={sorted} profile={payroll} details={dayDetails} zone={workZone} templates={templates} today={today} currentMonday={currentMonday} weekStart={weekStart} weekEnd={weekEnd} history={{ range: historyRange, setRange: setHistoryRange, query: historyQuery, setQuery: setHistoryQuery, expanded, setExpanded, exportOpen, setExportOpen }} creatingSheet={sheet.creating} onReview={() => setWeeklyExportOpen(true)} onEdit={(shift, date) => openEdit(shift, date)} onSettings={() => openSettings("profile")} onCsv={exportCsv} onBackup={() => void backups.exportBackup()} onCopy={shift => void copyShiftHours(shift)} onRetrySummary={retrySummary} onDelete={deleteShift}/>}
      {voiceAction && <div className="voice-confirm"><div><strong>Heard: “{voiceAction.transcript}”</strong><span>Confirm before the timer changes.</span></div><button onClick={confirmVoiceAction}>Confirm {voiceAction.kind}</button><button className="voice-cancel" onClick={() => setVoiceAction(null)} aria-label="Cancel voice command"><X size={17}/></button></div>}
      {sheet.sheetUrl && <div className="sheet-success"><FileSpreadsheet size={20}/><span>{sheet.shareStatus || "Your Google Sheet is ready."}</span><a href={sheet.sheetUrl} target="_blank" rel="noopener noreferrer">Open Google Sheet <ArrowRight size={15}/></a></div>}
    </main>
    <nav className="mobile-dock" data-view={view} aria-label="Main navigation"><span className="dock-indicator" aria-hidden="true"/><button aria-current={view === "today" ? "page" : undefined} onClick={() => { setView("today"); window.scrollTo({ top: 0 }); }}><Clock3 size={20}/><span>Today</span></button><button aria-current={view === "history" ? "page" : undefined} onClick={() => { setView("history"); window.scrollTo({ top: 0 }); }}><CalendarDays size={20}/><span>Week</span></button></nav>
    {voicePlanText !== null && <VoiceReview transcript={voicePlanText} shifts={shifts} zone={workZone} apiKey={geminiApiKey} accessCode={accessCode} onClose={() => setVoicePlanText(null)} onApply={value => { update({ shifts: value }); setNotice("Your reviewed changes were recorded."); }}/>}
    {storageError && <StorageError message={storageError} onBackup={() => void backups.exportBackup()}/>}
    {backups.restorePreview && <RestoreSheet preview={backups.restorePreview} currentCount={shifts.length} backups={backups}/>}

    {notice && !weeklyExportOpen && voicePlanText === null && <div className="toast" role="status"><Info size={17}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15}/></button></div>}

    {editing && <EditShift key={editing.key} shift={editing.shift} isNew={!shifts.some(s => s.id === editing.shift.id)} initialError={editing.error} shifts={shifts} zone={workZone} onClose={() => setEditing(null)} onSave={saveEdit}/>}

    {weeklyExportOpen && <WeeklyExport initialWeek={selectedWeek} zone={workZone} shifts={shifts} active={Boolean(active)} profile={payroll} onProfile={value => update({ payroll: value })} details={dayDetails} onDetails={value => update({ dayDetails: value })} onClose={closeWeeklyExport} clientId={effectiveClientId} onSettings={() => { setWeeklyExportOpen(false); openSettings("connections"); }} onGoogle={(report, email) => { setWeeklyExportOpen(false); sheet.startFromReport(report, email, payroll.email); }}/>}
    {sheet.shareOpen && <ShareSheet sheet={sheet}/>}

    {settingsOpen && <SettingsSheet section={settingsSection} onSection={setSettingsSection} onClose={() => setSettingsOpen(false)} online={online} effectiveClientId={effectiveClientId} google={googleConnection} backups={backups} onNotice={setNotice} onGoogleSetup={focusGoogleSetup}/>}
    {install.instructionsOpen && <InstallSheet onClose={() => install.setInstructionsOpen(false)}/>}
  </div>;
}

function emptyShift(): Shift {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60000);
  return { id: crypto.randomUUID(), start: start.toISOString(), end: end.toISOString(), notes: [] };
}

type ModalState = { editingId?: string; settingsOpen: boolean; shareOpen: boolean; weeklyExportOpen: boolean; installOpen: boolean; voicePlanOpen: boolean; restoreOpen: boolean; storageError: string; creatingSheet: boolean; onEscape: () => void };

/** Traps focus in the top dialog, locks page scroll, and closes the dialog on Escape. */
function useModalFocus(state: ModalState) {
  const escape = useRef(state.onEscape);
  escape.current = state.onEscape;
  const { editingId, settingsOpen, shareOpen, weeklyExportOpen, installOpen, voicePlanOpen, restoreOpen, storageError, creatingSheet } = state;
  useEffect(() => {
    if (weeklyExportOpen && !settingsOpen && !restoreOpen && !storageError) return; // WeeklyExport manages its own focus.
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>(".modal-backdrop"));
    const backdrop = dialogs.find(el => el.querySelector('[role="alertdialog"]')) || dialogs.find(el => el.querySelector('[aria-label="Restore preview"]')) || dialogs.at(-1), dialog = backdrop?.querySelector<HTMLElement>(".modal");
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.tabIndex = -1;
    const inert = [...Array.from(document.querySelectorAll<HTMLElement>(".topbar,.main-grid,.mobile-dock")), ...dialogs.filter(el => el !== backdrop)]; inert.forEach(el => el.inert = true);
    dialog.focus();
    function keys(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !storageError && !creatingSheet) escape.current();
      if (event.key !== "Tab") return;
      const items = Array.from(dialog!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,a[href]')).filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1); if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = overflow; inert.forEach(el => el.inert = false); document.removeEventListener("keydown", keys); if (previous?.isConnected) previous.focus(); };
  }, [editingId, settingsOpen, shareOpen, weeklyExportOpen, installOpen, voicePlanOpen, restoreOpen, storageError, creatingSheet]);
}
