"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion/mini";
import WeeklyExport from "./weekly-export";
import GoogleSetup from "./google-setup";
import WeekView from "./week-view";
import VoiceReview from "./voice-review";
import CloudBackup from "./cloud-backup";
import { TemplateSettings } from "./shift-templates";
import { createBackup } from "@/lib/backup";
import { DEFAULT_TEMPLATES, validateTemplates, type ShiftTemplate } from "@/lib/templates";
import OfflineStatus, { useOnlineStatus } from "./offline-status";
import { dateInZone, timeInZone, zonedInstant, mondayOf, addDays, periodMinutes, shiftWarnings, DEFAULT_ZONE } from "@/lib/ledger";
import { loadState, saveState, stateSignature, decodeSubmissions, validateBackup, allSubmissions, saveSubmission, downloadBlob, type Submission } from "@/lib/storage";
import { isTimeRequest } from "@/lib/voice-plan";
import { googleAccount as connectGoogleAccount, requestGoogleToken, GOOGLE_FILE_SCOPE, normalizeGoogleClientId as normalizeClientId, validGoogleClientId as validClientId } from "@/lib/google-auth";
import { type PayrollProfile, type DayDetails, type WeeklyReport } from "@/lib/timesheet";
import { Activity, ArrowDownToLine, ArrowRight, CalendarDays, Check, ChevronDown, Clipboard, Clock3, Download, FileSpreadsheet, History, Info, LockKeyhole, Mail, MessageCircle, Mic, MicOff, Moon, Pause, Pencil, Play, Plus, RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, Sun, Trash2, X } from "lucide-react";
import { durationLabel, localDateKey, minutesBetween, shiftsCsv, thisWeekStart, type ActiveShift, type Shift } from "@/lib/time";
import { createGoogleSheet, shareGoogleSheet } from "@/lib/sheets";
import { interpretVoice } from "@/lib/voice";

const STORAGE_KEY = "routehours:v1";
type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type VoiceAction = { kind: "start" | "stop"; transcript: string };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type DictationLanguage = "auto" | "en" | "da" | "ar";
type ThemeMode = "system" | "light" | "dark";
type HistoryRange = "all" | "week" | "month";
type StoredData = { workZone: string; shifts: Shift[]; active: ActiveShift | null; noteDraft: string; aiEnabled: boolean; accessCode: string; geminiApiKey: string; groqApiKey: string; dictationLanguage: DictationLanguage; googleClientId: string; themeMode: ThemeMode; weeklyGoalHours: number; payroll: PayrollProfile; dayDetails: DayDetails; templates: ShiftTemplate[] };

function readStored(input?: unknown): StoredData {
  try {
    const value = input === undefined ? JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") : input;
    if (value) validateBackup(value);
    return {
      workZone: typeof value?.workZone === "string" ? value.workZone : DEFAULT_ZONE,
      shifts: Array.isArray(value?.shifts) ? value.shifts.filter((s: Shift) => s && s.id && s.start && s.end) : [],
      active: value?.active?.start ? value.active : null,
      noteDraft: value?.active?.start && typeof value?.noteDraft === "string" ? value.noteDraft.slice(0, 2000) : "",
      aiEnabled: value?.aiEnabled === true,
      accessCode: typeof value?.accessCode === "string" && !value.accessCode.startsWith("AIza") ? value.accessCode : "",
      geminiApiKey: typeof value?.geminiApiKey === "string" ? value.geminiApiKey : typeof value?.accessCode === "string" && value.accessCode.startsWith("AIza") ? value.accessCode : "",
      groqApiKey: typeof value?.groqApiKey === "string" ? value.groqApiKey : "",
      dictationLanguage: value?.dictationLanguage === "en" || value?.dictationLanguage === "da" || value?.dictationLanguage === "ar" ? value.dictationLanguage : "auto",
      googleClientId: typeof value?.googleClientId === "string" ? value.googleClientId : "",
      themeMode: value?.themeMode === "light" || value?.themeMode === "dark" ? value.themeMode : "system",
      weeklyGoalHours: typeof value?.weeklyGoalHours === "number" && Number.isFinite(value.weeklyGoalHours) ? Math.max(0, Math.min(80, value.weeklyGoalHours)) : 0,
      payroll: { name: typeof value?.payroll?.name === "string" ? value.payroll.name : "", number: typeof value?.payroll?.number === "string" ? value.payroll.number : "", email: typeof value?.payroll?.email === "string" ? value.payroll.email : "" },
      dayDetails: value?.dayDetails && typeof value.dayDetails === "object" && !Array.isArray(value.dayDetails) ? value.dayDetails : {},
      templates: validateTemplates(value?.templates ?? DEFAULT_TEMPLATES),
    };
  } catch { throw new Error("Your saved data could not be read. It has been preserved. Export the original data below before restoring a valid backup."); }
}

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function emptyShift(): Shift {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60000);
  return { id: crypto.randomUUID(), start: start.toISOString(), end: end.toISOString(), notes: [] };
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function cleanNoteDraft(value: string) { return value.split("\n").map(line => line.trim()).filter(line => line && !/^(Route timing|Support provided|Follow-up):$/i.test(line)).join("\n"); }

export default function Home() {
  const online = useOnlineStatus();
  const [loaded, setLoaded] = useState(false);
  const [workZone, setWorkZone] = useState(DEFAULT_ZONE);
  const [selectedWeek, setSelectedWeek] = useState(mondayOf(dateInZone(Date.now())));
  const [saveStatus, setSaveStatus] = useState("Loading your records…");
  const [storageError, setStorageError] = useState("");
  const [bootError, setBootError] = useState("");
  const lastEnqueued = useRef("");
  const revision = useRef(0), saveQueue = useRef<Promise<void>>(Promise.resolve()), storageBlocked = useRef(false), saveSequence = useRef(0);
  const [lastSavedShift, setLastSavedShift] = useState<Shift | null>(null);
  const [voicePlanText, setVoicePlanText] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [lastBackup, setLastBackup] = useState("");
  const [googleAccount, setGoogleAccount] = useState(""), [googleConnecting, setGoogleConnecting] = useState(false), [googleError, setGoogleError] = useState("");
  const [timerCheckedAt, setTimerCheckedAt] = useState(0);
  function formatTime(value: string) { return timeInZone(value, workZone); }
  function formatDay(value: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: workZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
  function localInput(value: string) { return dateInZone(value, workZone) + "T" + timeInZone(value, workZone); }
  const [view, setView] = useState<"today" | "history">("today");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [active, setActive] = useState<ActiveShift | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [dictationLanguage, setDictationLanguage] = useState<DictationLanguage>("auto");
  const [checkingGroq, setCheckingGroq] = useState(false);
  const [groqConnection, setGroqConnection] = useState<{ ok: boolean; message: string } | null>(null);
  const [googleClientId, setGoogleClientId] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [prefersDark, setPrefersDark] = useState(false);
  const [weeklyGoalHours, setWeeklyGoalHours] = useState(0);
  const [payroll, setPayroll] = useState<PayrollProfile>({ name: "", number: "", email: "" });
  const [dayDetails, setDayDetails] = useState<DayDetails>({});
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [weeklyExportOpen, setWeeklyExportOpen] = useState(false);
  const [shareReport, setShareReport] = useState<WeeklyReport | undefined>();
  const closeWeeklyExport = useCallback(() => setWeeklyExportOpen(false), []);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [checkingAi, setCheckingAi] = useState(false);
  const [aiConnection, setAiConnection] = useState<{ ok: boolean; message: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [noteInput, setNoteInput] = useState("");
  const [editing, setEditing] = useState<Shift | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [modalError, setModalError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetShareStatus, setSheetShareStatus] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareRole, setShareRole] = useState<"reader" | "writer">("reader");
  const [shareError, setShareError] = useState("");
  const [shareRetryId, setShareRetryId] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const installPrompt = useRef<InstallPrompt | null>(null);
  const importing = useRef<HTMLInputElement>(null);
  const processing = useRef(new Set<string>());
  const recognition = useRef<Recognition | null>(null);
  const voiceTarget = useRef<"general" | "assistant">("general");
  const activeRef = useRef<ActiveShift | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderStream = useRef<MediaStream | null>(null);
  const recordingClock = useRef<number | null>(null);
  const recordingLimit = useRef<number | null>(null);
  const recordingStarted = useRef(0);
  const recordingCancelled = useRef(false);
  const recordedChunks = useRef<Blob[]>([]);
  const audioMeter = useRef<AudioContext | null>(null);
  const meterFrame = useRef<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const micStartingRef = useRef(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceAction, setVoiceAction] = useState<VoiceAction | null>(null);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 6000); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (weeklyExportOpen && !settingsOpen && !restorePreview && !storageError) return; // WeeklyExport manages its own focus.
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>(".modal-backdrop"));
    const backdrop = dialogs.find(el => el.querySelector('[role="alertdialog"]')) || dialogs.find(el => el.querySelector('[aria-label="Restore preview"]')) || dialogs.at(-1), dialog = backdrop?.querySelector<HTMLElement>(".modal");
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.tabIndex = -1;
    const inert = [...Array.from(document.querySelectorAll<HTMLElement>(".topbar,.main-grid,.mobile-dock")), ...dialogs.filter(el => el !== backdrop)]; inert.forEach(el => el.inert = true);
    dialog.focus();
    function keys(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !storageError && !creatingSheet) { if (restorePreview) setRestorePreview(null); else if (voicePlanText !== null) setVoicePlanText(null); else if (installOpen) setInstallOpen(false); else if (settingsOpen) setSettingsOpen(false); else if (shareOpen) setShareOpen(false); else setEditing(null); }
      if (event.key !== "Tab") return;
      const items = Array.from(dialog!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,a[href]')).filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1); if (!first || !last) {event.preventDefault();return;}
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {event.preventDefault();first.focus();}
    }
    document.addEventListener("keydown",keys);
    return () => {document.body.style.overflow=overflow;inert.forEach(el => el.inert=false);document.removeEventListener("keydown",keys);if(previous?.isConnected)previous.focus();};
  }, [editing?.id,settingsOpen,shareOpen,weeklyExportOpen,installOpen,voicePlanText !== null,restorePreview !== null,storageError,creatingSheet]);


  useEffect(() => {
    let cancelled = false;
    void loadState<StoredData>().then(({ data, revision: rev }) => {
      if (cancelled) return;
      if (!data && JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")?.storageVersion === 2) throw new Error("The device database is missing. Restore an external backup; your settings have been preserved.");
      const saved = readStored(data || undefined); revision.current = rev; if(data) { lastEnqueued.current = stateSignature(saved); setSaveStatus("Saved on this device"); }
      setShifts(saved.shifts); setActive(saved.active); setNoteInput(saved.noteDraft); setAiEnabled(saved.aiEnabled); setAccessCode(saved.accessCode); setGeminiApiKey(saved.geminiApiKey); setGroqApiKey(saved.groqApiKey); setDictationLanguage(saved.dictationLanguage); setGoogleClientId(saved.googleClientId); setThemeMode(saved.themeMode); setWeeklyGoalHours(saved.weeklyGoalHours); setPayroll(saved.payroll); setDayDetails(saved.dayDetails); setTemplates(saved.templates); setWorkZone(saved.workZone); setSelectedWeek(mondayOf(dateInZone(Date.now(), saved.workZone))); setLastBackup(localStorage.getItem("routehours:last-backup") || ""); setLoaded(true);
    }).catch(e => { if (!cancelled) setBootError(e.message); });
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      recordingCancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorderStream.current?.getTracks().forEach(track => track.stop());
      if (recordingClock.current) window.clearInterval(recordingClock.current);
      if (recordingLimit.current) window.clearTimeout(recordingLimit.current);
      stopMeter();
      recognition.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const panel = document.querySelector(".today-view, .week-layout");
    if (!panel) return;
    const transition = animate(panel, { opacity: [.55, 1] }, { duration: .18, ease: [0.16, 1, 0.3, 1] });
    return () => transition.stop();
  }, [loaded, view]);

  useEffect(() => {
    if (!loaded || !active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const digits = document.querySelector(".timer-digits");
    if (!digits) return;
    const transition = animate(digits, { transform: ["scale(.97)", "scale(1)"], filter: ["blur(2px)", "blur(0px)"] }, { duration: .3, ease: [0.16, 1, 0.3, 1] });
    return () => transition.stop();
  }, [loaded, active?.start]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const modals = document.querySelectorAll(".modal");
    const animations = Array.from(modals).map(modal => animate(modal, { opacity: [.7, 1], transform: ["translateY(24px)", "translateY(0)"] }, { duration: .3, ease: [0.16, 1, 0.3, 1] }));
    return () => animations.forEach(animation => animation.stop());
  }, [settingsOpen, shareOpen, weeklyExportOpen, editing, installOpen, voicePlanText !== null]);

  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode === "system" ? "light dark" : themeMode;
  }, [loaded, themeMode]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPrefersDark(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); installPrompt.current = event as InstallPrompt; };
    const onInstalled = () => { setInstalled(true); setInstallOpen(false); installPrompt.current = null; };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  function snapshot(): StoredData { return { shifts, active, noteDraft: noteInput, aiEnabled, accessCode, geminiApiKey, groqApiKey, dictationLanguage, googleClientId, themeMode, weeklyGoalHours, payroll, dayDetails, templates, workZone }; }
  function persist(data: StoredData, receipts: Submission[] = []) {
    lastEnqueued.current = stateSignature(data);
    const sequence = ++saveSequence.current;
    setSaveStatus("Saving…");
    const operation = saveQueue.current.then(async () => {
      if (storageBlocked.current) throw new Error("Saving is paused. Back up this screen and reload.");
      revision.current = await saveState(data, revision.current, receipts);
      if(receipts.length) window.dispatchEvent(new Event("routehours:submissions"));
      // Keep a small theme/settings hint. The database is authoritative; legacy data is untouched until migration succeeds.
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ storageVersion: 2, themeMode: data.themeMode })); } catch { /* Records are already saved transactionally. */ }
      if (sequence === saveSequence.current) setSaveStatus("Saved on this device");
    });
    saveQueue.current = operation.catch(error => { storageBlocked.current = true; setSaveStatus("Not saved"); setStorageError(error.message); });
    return operation;
  }
  useEffect(() => {
    if (!loaded) return;
    const data = snapshot(); if (lastEnqueued.current === stateSignature(data)) return;
    void persist(data).catch(() => {});
  }, [loaded, shifts, active, noteInput, aiEnabled, accessCode, geminiApiKey, groqApiKey, dictationLanguage, googleClientId, themeMode, weeklyGoalHours, payroll, dayDetails, templates, workZone]);
  useEffect(() => {
    if (!loaded) return;
    const check = () => { void loadState<StoredData>().then(latest => { if (latest.revision > revision.current && document.visibilityState === "visible") { storageBlocked.current = true; setStorageError("Another tab changed your records. Back up any unsaved changes, then reload to continue with the latest version."); } }).catch(() => {}); };
    const timer = window.setInterval(check, 5000); window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !aiEnabled || !(geminiApiKey || accessCode)) return;
    for (const shift of shifts) {
      if (shift.summaryStatus !== "pending" || processing.current.has(shift.id)) continue;
      processing.current.add(shift.id);
      void fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-access-token": accessCode },
        body: JSON.stringify({ start: shift.start, end: shift.end, notes: shift.notes, ...(geminiApiKey ? { apiKey: geminiApiKey } : {}) }),
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Summary unavailable");
        setShifts(current => current.map(item => item.id === shift.id && item.start === shift.start && item.end === shift.end && JSON.stringify(item.notes) === JSON.stringify(shift.notes) ? { ...item, summary: result.summary, summaryStatus: "done", summaryError: undefined } : item));
      }).catch(error => {
        const message = error instanceof Error ? error.message : "Summary unavailable";
        setShifts(current => current.map(item => item.id === shift.id ? { ...item, summaryStatus: "error", summaryError: message } : item));
        setNotice(message);
      }).finally(() => processing.current.delete(shift.id));
    }
  }, [loaded, aiEnabled, accessCode, geminiApiKey, shifts]);

  const sorted = useMemo(() => shifts.slice().sort((a, b) => b.start.localeCompare(a.start)), [shifts]);
  const savedShift = lastSavedShift ? shifts.find(shift => shift.id === lastSavedShift.id) : undefined;
  const todayKey = dateInZone(now, workZone), currentMonday = mondayOf(todayKey);
  const weekStart = Date.parse(zonedInstant(currentMonday + "T00:00", workZone)), weekEnd = Date.parse(zonedInstant(addDays(currentMonday,7) + "T00:00", workZone));
  const weekShifts = shifts.filter(s => Date.parse(s.start) < weekEnd && Date.parse(s.end) > weekStart);
  const weekMinutes = useMemo(() => periodMinutes(shifts, currentMonday, addDays(currentMonday,7), workZone), [shifts,currentMonday,workZone]);
  const monthKey = todayKey.slice(0,7), monthStart = monthKey + "-01";
  const nextMonth = new Date(monthStart + "T12:00Z"); nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
  const monthMinutes = useMemo(() => periodMinutes(shifts, monthStart, nextMonth.toISOString().slice(0,10), workZone), [shifts,monthStart,workZone]);
  const filteredShifts = useMemo(() => sorted.filter(shift => {
    if (historyRange === "week" && (Date.parse(shift.start) >= weekEnd || Date.parse(shift.end) <= weekStart)) return false;
    if (historyRange === "month" && !(dateInZone(shift.start,workZone) < nextMonth.toISOString().slice(0,10) && dateInZone(shift.end,workZone) >= monthStart)) return false;
    const query = historyQuery.trim().toLocaleLowerCase();
    return !query || [formatDay(shift.start), dateInZone(shift.start,workZone), ...shift.notes, shift.summary?.overview || ""].join(" ").toLocaleLowerCase().includes(query);
  }), [sorted, historyRange, historyQuery, weekStart, weekEnd, monthKey, workZone]);
  const activeSeconds = active ? Math.max(0, Math.floor((now - Date.parse(active.start)) / 1000)) : 0;
  const isDarkTheme = themeMode === "dark" || themeMode === "system" && prefersDark;

  function startShift() {
    if (active || storageBlocked.current) return;
    setLastSavedShift(null); setActive({ start: new Date().toISOString(), notes: [] });
    setNoteInput("");
    setNotice("Shift started. Your timer will keep its place if you close this tab.");
  }
  function stopShift() {
    if (!active) return;
    const end = new Date().toISOString();
    const draft = cleanNoteDraft(noteInput);
    const notes = draft ? [...active.notes, draft] : active.notes;
    const willSummarize = aiEnabled && Boolean(geminiApiKey || accessCode);
    const shift: Shift = { id: crypto.randomUUID(), start: active.start, end, notes, summaryStatus: willSummarize ? "pending" : undefined };
    setShifts(current => [shift, ...current]); setLastSavedShift(shift);
    setActive(null); setNoteInput(""); setExpanded(shift.id);
    setNotice("");
  }
  function addNote() {
    const note = cleanNoteDraft(noteInput);
    if (!note || !active) return;
    setActive({ ...active, notes: [...active.notes, note] });
    setNoteInput("");
  }
  function insertNotePrompt(prompt: string) {
    setNoteInput(current => `${current.trim() ? `${current.trim()}\n` : ""}${prompt}: `.slice(0, 2000));
    window.setTimeout(() => document.getElementById("quick-note-input")?.focus(), 0);
  }
  async function copyShiftHours(shift: Shift) {
    const minutes = minutesBetween(shift.start, shift.end);
    const text = `RouteHours · ${formatDay(shift.start)}\nStart: ${new Date(shift.start).toLocaleString("en-GB", { timeZone: workZone })}\nEnd: ${new Date(shift.end).toLocaleString("en-GB", { timeZone: workZone })}\nHours: ${durationLabel(minutes)} (${(minutes / 60).toFixed(2)} decimal hours)`;
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
      setAssistantOpen(true);
      setAssistantQuestion(intent.question);
      void askAssistant(intent.question);
    } else if (intent.kind === "logHours") {
      const hours = intent.hours;
      if (hours > 0 && hours <= 24) {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 3600000);
        const draft: Shift = { id: crypto.randomUUID(), start: start.toISOString(), end: end.toISOString(), notes: [] };
        openEdit(draft);
        setModalError("Review the suggested times before saving. The app only heard a duration, so it assumed the shift ended now.");
      } else setNotice("Say a duration between 0 and 24 hours.");
    } else if (intent.kind === "note" && activeRef.current) {
      const note = intent.text;
      setNoteInput(current => current.trim() ? `${current.trim()} ${note}` : note);
      setNotice("Dictation added to your note draft. Review it, then tap Add note or stop the shift.");
    } else setNotice("Start a shift first to dictate a note, or say ‘log 2 hours’ for a manual entry.");
  }
  function acceptVoiceTranscript(transcript: string) {
    if (voiceTarget.current !== "assistant") { handleVoiceTranscript(transcript); return; }
    voiceTarget.current = "general";
    const heard = transcript.trim();
    if (!heard) { setNotice("No speech was heard. Tap the mic and try again."); return; }
    if (isTimeRequest(heard)) { setVoicePlanText(heard); return; }
    const intent = interpretVoice(heard);
    if (intent.kind === "start" || intent.kind === "stop" || intent.kind === "logHours" || /^(add|take|write)( a)? note\b/i.test(heard)) { handleVoiceTranscript(heard); return; }
    setAssistantQuestion(heard.slice(0, 1200));
    setNotice("Question ready. Review it, then tap Send.");
  }
  function toggleAssistantMic() {
    if (voiceTarget.current === "assistant" && recording) { stopGroqRecording(); return; }
    if (voiceTarget.current === "assistant" && listening) { recognition.current?.stop(); setListening(false); return; }
    if (recording || listening || transcribing || micStarting) return;
    voiceTarget.current = "assistant";
    if (groqApiKey.trim()) void startGroqRecording();
    else startListening();
  }
  function toggleNoteMic() {
    if (voiceTarget.current === "general" && recording) { stopGroqRecording(); return; }
    if (voiceTarget.current === "general" && listening) { recognition.current?.stop(); setListening(false); return; }
    if (recording || listening || transcribing || micStarting) return;
    voiceTarget.current = "general";
    if (groqApiKey.trim()) void startGroqRecording(); else startListening();
  }
  function stopMeter() {
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    if (audioMeter.current) void audioMeter.current.close().catch(() => {});
    audioMeter.current = null;
    setAudioLevel(0);
  }
  function startMeter(stream: MediaStream) {
    try {
      const context = new AudioContext(); audioMeter.current = context;
      void context.resume().catch(() => {});
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (now: number) => {
        if (now - last > 60) {
          analyser.getByteTimeDomainData(buffer);
          const rms = Math.sqrt(buffer.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / buffer.length);
          setAudioLevel(Math.min(1, rms * 7)); last = now;
        }
        meterFrame.current = requestAnimationFrame(tick);
      };
      meterFrame.current = requestAnimationFrame(tick);
    } catch { /* Dictation still works when the optional meter is unavailable. */ }
  }
  function voiceStatus(target: "general" | "assistant") {
    if (voiceTarget.current !== target || !(recording || listening || micStarting || transcribing)) return null;
    return <div className="assistant-listening" role="status"><span className={`assistant-mini-wave ${listening ? "recognizing" : ""}`} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ transform: `scaleY(${(4 + audioLevel * (23 - Math.abs(i - 3) * 4)) / 27})` }}/>)}</span><span>{transcribing ? "Turning speech into text…" : micStarting ? "Opening microphone…" : recording ? `Listening · ${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")} · tap mic to finish` : "Listening… speak now"}</span></div>;
  }
  function startListening() {
    const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) { setNotice("Voice input is unavailable in this browser. You can still type notes and use the timer."); return; }
    setVoiceAction(null);
    const instance = new Speech();
    instance.lang = dictationLanguage === "da" ? "da-DK" : dictationLanguage === "ar" ? "ar-SA" : "en-US";
    instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => acceptVoiceTranscript(event.results[0]?.[0]?.transcript || "");
    instance.onerror = event => {
      voiceTarget.current = "general";
      setListening(false);
      setNotice(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was blocked. Allow microphone access in your browser settings."
        : event.error === "no-speech" ? "I didn't hear anything. Tap the microphone and try again."
          : event.error === "network" ? "Speech recognition needs a connection in this browser. Try again online."
            : "Could not capture speech. Check microphone permission and try again.");
    };
    instance.onend = () => { setListening(false); voiceTarget.current = "general"; };
    recognition.current = instance;
    try { instance.start(); setListening(true); } catch { setListening(false); setNotice("Microphone could not start."); }
  }
  function releaseRecording() {
    stopMeter();
    if (recordingClock.current !== null) window.clearInterval(recordingClock.current);
    if (recordingLimit.current !== null) window.clearTimeout(recordingLimit.current);
    recordingClock.current = null; recordingLimit.current = null;
    recorderStream.current?.getTracks().forEach(track => track.stop());
    recorderStream.current = null; recorder.current = null;
    setRecording(false);
  }
  async function transcribeRecording(blob: Blob, mimeType: string, key: string, language: DictationLanguage) {
    if (!blob.size || blob.size > 3_000_000) {
      voiceTarget.current = "general";
      setTranscribing(false);
      setNotice(blob.size ? "Recording is too large. Try a shorter note." : "No audio was recorded. Try again.");
      return;
    }
    const type = mimeType.split(";")[0];
    const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("audio", new File([blob], `routehours-dictation.${extension}`, { type }));
    if (language !== "auto") form.append("language", language);
    try {
      const response = await fetch("/api/transcribe", { method: "POST", headers: { "x-groq-api-key": key }, body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.text !== "string") throw new Error(result?.error || "Groq did not return text. Try again.");
      acceptVoiceTranscript(result.text);
    } catch (error) {
      voiceTarget.current = "general";
      setNotice(error instanceof TypeError ? "Could not reach Groq. Check your connection and try again." : error instanceof Error ? error.message : "Could not transcribe. Try again online.");
    } finally { setTranscribing(false); }
  }
  function stopGroqRecording() {
    const instance = recorder.current;
    if (!instance || instance.state !== "recording") return;
    setRecording(false); setTranscribing(true);
    try { instance.stop(); }
    catch { releaseRecording(); setTranscribing(false); setNotice("Recording could not stop. Try again."); }
  }
  async function startGroqRecording() {
    if (micStartingRef.current || recording || transcribing) return;
    if (!navigator.onLine) { setNotice("Groq dictation needs an internet connection. You can still type a note."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("Audio recording is unavailable in this browser. Trying browser voice input instead.");
      startListening();
      return;
    }
    micStartingRef.current = true; setMicStarting(true);
    recordingCancelled.current = false;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (recordingCancelled.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const key = groqApiKey.trim();
      const language = dictationLanguage;
      recorder.current = instance; recorderStream.current = stream; recordedChunks.current = []; recordingCancelled.current = false;
      instance.ondataavailable = event => { if (event.data.size) recordedChunks.current.push(event.data); };
      instance.onerror = () => {
        recordingCancelled.current = true;
        setNotice("Recording failed. Check microphone access and try again.");
        if (instance.state === "recording") stopGroqRecording();
        else { releaseRecording(); setTranscribing(false); }
      };
      instance.onstop = () => {
        const type = instance.mimeType || mimeType || "audio/webm";
        const audio = new Blob(recordedChunks.current, { type });
        recordedChunks.current = [];
        releaseRecording();
        if (recordingCancelled.current) { setTranscribing(false); return; }
        void transcribeRecording(audio, type, key, language);
      };
      setVoiceAction(null); setRecordSeconds(0);
      instance.start(); setRecording(true);
      startMeter(stream);
      recordingStarted.current = Date.now();
      recordingClock.current = window.setInterval(() => setRecordSeconds(Math.floor((Date.now() - recordingStarted.current) / 1000)), 500);
      recordingLimit.current = window.setTimeout(() => { setNotice("One minute recorded. Sending it to Groq now."); stopGroqRecording(); }, 60_000);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      releaseRecording();
      setNotice("Microphone could not start. Allow microphone access in your browser settings.");
    } finally { micStartingRef.current = false; setMicStarting(false); }
  }
  async function testGroqConnection() {
    if (!groqApiKey.trim()) { setGroqConnection({ ok: false, message: "Enter your Groq API key first." }); return; }
    setCheckingGroq(true); setGroqConnection(null);
    try {
      const response = await fetch("/api/transcribe", { headers: { "x-groq-api-key": groqApiKey.trim() } });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ready) throw new Error(result?.error || "Groq is unavailable. Try again.");
      setGroqConnection({ ok: true, message: "Groq is ready for dictation." });
    } catch (error) {
      setGroqConnection({ ok: false, message: error instanceof TypeError ? "Could not reach Groq. Check your connection." : error instanceof Error ? error.message : "Could not connect to Groq." });
    } finally { setCheckingGroq(false); }
  }
  function confirmVoiceAction() {
    if (!voiceAction) return;
    if (voiceAction.kind === "start") { if (!active) startShift(); else setNotice("A shift is already running."); }
    else { if (active) stopShift(); else setNotice("There is no active shift to stop."); }
    setVoiceAction(null);
  }
  function openEdit(shift?: Shift, selectedDate?: string) {
    const value = shift || (selectedDate ? { id: crypto.randomUUID(), start: zonedInstant(selectedDate + "T07:00", workZone, true), end: zonedInstant(selectedDate + "T09:00", workZone, true), notes: [] } : emptyShift());
    setEditing(value); setEditStart(localInput(value.start)); setEditEnd(localInput(value.end)); setEditNotes(value.notes.join("\n")); setModalError("");
  }
  function saveEdit() {
    if (!editing) return;
    let start: Date, end: Date;
    try { start = new Date(editStart === localInput(editing.start) ? editing.start : zonedInstant(editStart, workZone, true)); end = new Date(editEnd === localInput(editing.end) ? editing.end : zonedInstant(editEnd, workZone, true)); } catch(e) { setModalError((e as Error).message); return; }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setModalError("End time must be later than start time."); return; }
    const updated: Shift = { ...editing, start: start.toISOString(), end: end.toISOString(), notes: editNotes.split("\n").map(s => s.trim()).filter(Boolean), summary: undefined, summaryStatus: undefined, summaryError: undefined };
    const warnings = shiftWarnings([...shifts.filter(s => s.id !== editing.id), updated]).filter(w => w.ids.includes(updated.id));
    if (warnings.length && !window.confirm(warnings.map(w => w.message).join("\n") + "\nSave these times anyway?")) return;
    setShifts(current => current.some(s => s.id === editing.id) ? current.map(s => s.id === editing.id ? updated : s) : [updated, ...current]);
    if (lastSavedShift?.id === updated.id) setLastSavedShift(updated);
    setEditing(null); setNotice("Shift saved. Generate the summary again if details changed.");
  }
  function retrySummary(shift: Shift) {
    if (!(geminiApiKey || accessCode) || !aiEnabled) { setSettingsOpen(true); return; }
    setShifts(current => current.map(s => s.id === shift.id ? { ...s, summaryStatus: "pending", summaryError: undefined } : s));
  }
  async function testAiConnection() {
    if (!geminiApiKey.trim() && !accessCode.trim()) {
      setAiConnection({ ok: false, message: "Enter a Gemini API key first." });
      return;
    }
    setCheckingAi(true); setAiConnection(null);
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-access-token": accessCode.trim() },
        body: JSON.stringify({ apiKey: geminiApiKey.trim(), start: "2026-01-01T08:00:00.000Z", end: "2026-01-01T09:00:00.000Z", notes: ["Connection test only. No real shift data."] }),
      });
      const result = await response.json();
      if (!response.ok || !result.summary) throw new Error(result.error || "Gemini did not return a summary.");
      setAiEnabled(true);
      setSettingsSaved(false);
      setAiConnection({ ok: true, message: "Gemini is connected. Automatic summaries are on." });
    } catch (error) {
      setAiConnection({ ok: false, message: error instanceof Error ? error.message : "Connection test failed. Try again online." });
    } finally { setCheckingAi(false); }
  }
  async function askAssistant(question = assistantQuestion) {
    const asked = question.trim();
    if (!asked || assistantBusy) return;
    setAssistantOpen(true); setAssistantQuestion(asked); setAssistantAnswer(""); setAssistantError("");
    if (!geminiApiKey.trim() && !accessCode.trim()) { setAssistantError("Connect Gemini in Settings to ask a question."); return; }
    setAssistantBusy(true);
    const aboutNote = /note|structur|summar|word|write|formul|skriv|notat|ملاحظ/i.test(asked);
    const context = `Active shift: ${activeRef.current ? "yes" : "no"}. Saved shifts: ${shifts.length}. This week: ${durationLabel(weekMinutes)}. This month: ${durationLabel(monthMinutes)}.${aboutNote && activeRef.current ? ` Current note draft: ${noteInput.slice(0, 1200) || "empty"}. Saved notes in active shift: ${activeRef.current.notes.join(" | ").slice(0, 1000) || "none"}.` : ""}`;
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json", "x-app-access-token": accessCode.trim() }, body: JSON.stringify({ question: asked, context, apiKey: geminiApiKey.trim() }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.answer !== "string") throw new Error(result?.error || "RouteHours could not answer. Try again.");
      setAssistantAnswer(result.answer);
    } catch (error) { setAssistantError(error instanceof TypeError ? "Could not connect. Try again online." : error instanceof Error ? error.message : "Could not answer."); }
    finally { setAssistantBusy(false); }
  }
  async function saveSettings() {
    const normalizedId = normalizeClientId(googleClientId);
    if (normalizedId && !validClientId(normalizedId)) { setSettingsSaved(false); setSettingsSaveError("Paste a Web application client ID ending in .apps.googleusercontent.com, or its downloaded JSON."); return; }
    try { await persist({ ...snapshot(), googleClientId: normalizedId }); setGoogleClientId(normalizedId); setSettingsSaved(true); setSettingsSaveError(""); }
    catch (e) { setSettingsSaved(false); setSettingsSaveError((e as Error).message); }
  }
  async function connectGoogle() {
    if (!online) { setGoogleError("Go online to connect Google. Your settings stay saved here."); return; }
    setGoogleConnecting(true); setGoogleError("");
    try { const account = await connectGoogleAccount(normalizeClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""); setGoogleAccount(account.email); }
    catch(e) { setGoogleError((e as Error).message); } finally { setGoogleConnecting(false); }
  }
  function toggleTheme() {
    setThemeMode(isDarkTheme ? "light" : "dark");
    setSettingsSaved(false);
  }
  function deleteShift(id: string) {
    if (!window.confirm("Delete this shift? This cannot be undone unless you have a backup.")) return;
    setShifts(current => current.filter(s => s.id !== id)); if (lastSavedShift?.id === id) setLastSavedShift(null);
  }
  function exportCsv(detailed: boolean) {
    if (!shifts.length) return;
    download(`routehours-${monthKey}${detailed ? "-detailed" : "-hours"}.csv`, shiftsCsv(shifts, detailed, workZone), "text/csv;charset=utf-8");
    setExportOpen(false);
  }
  async function exportGoogleSheet(share = false, report = shareReport) {
    const clientId = normalizeClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (share && !validEmail(shareRecipient)) { setShareError("Enter a valid email address before sharing."); return; }
    if (!clientId) { setExportOpen(false); setShareOpen(false); setSettingsOpen(true); setNotice("Add and save your Google OAuth client ID in Settings first."); return; }
    if (!validClientId(clientId)) { setExportOpen(false); setShareOpen(false); setSettingsOpen(true); setNotice("Check the Google Web application client ID in Settings."); return; }
    setExportOpen(false); setShareError(""); setSheetShareStatus(""); setCreatingSheet(true);
    if (!shareRetryId) setSheetUrl("");
    try {
      const { token } = await requestGoogleToken(clientId, GOOGLE_FILE_SCOPE);
      const result = share && shareRetryId ? { id: shareRetryId, url: sheetUrl, complete: true } : await createGoogleSheet(token, shifts, report);
      setSheetUrl(result.url);
      if (!result.complete) { setShareError("The Sheet was created, but its hours could not be added. Open it below and try the CSV export."); setNotice("Sheet created without hours. Open the link below."); return; }
      if (share) {
        setShareRetryId(result.id);
        await shareGoogleSheet(token, result.id, shareRecipient, shareRole);
        setSheetShareStatus(`Google sent a sharing notification to ${shareRecipient.trim()}.`);
        setShareRetryId(""); setShareOpen(false);
        setNotice("Google Sheet created and shared by email.");
      } else { setShareRetryId(""); setNotice("Google Sheet created. Open it from the link below."); }
    } catch (error) { const message = error instanceof Error ? error.message : "Could not create or share Google Sheet."; setShareError(message); setNotice(message); }
    finally { setCreatingSheet(false); }
  }
  async function openInstall() {
    const prompt = installPrompt.current;
    if (!prompt) { setInstallOpen(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    installPrompt.current = null;
  }
  function parseBackup(value: unknown) { validateBackup(value); decodeSubmissions(value.submissions); return value; }
  async function makeCompleteBackup() {
    const source = structuredClone(snapshot()), stamp = new Date().toISOString();
    return createBackup(source, await allSubmissions(), stamp);
  }
  async function saveTemplates(value: ShiftTemplate[]) {
    const next = validateTemplates(value);
    await persist({ ...snapshot(), templates: next });
    setTemplates(next);
  }
  function focusGoogleSetup() {
    const field = document.getElementById("google-client-id");
    field?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    field?.focus({ preventScroll: true });
  }
  async function exportBackup() {
    try {
      const backup = await makeCompleteBackup();
      downloadBlob(backup.blob, "routehours-backup.json");
      setLastBackup(backup.data.createdAt);
      try { localStorage.setItem("routehours:last-backup", backup.data.createdAt); } catch { /* The download is complete. */ }
      setNotice("Backup downloaded. Keep this file somewhere outside this browser.");
    } catch { download("routehours-emergency-backup.json", JSON.stringify({ shifts, active, noteDraft: noteInput, payroll, dayDetails, workZone, templates },null,2), "application/json"); setNotice("Downloaded current shifts and templates. Saved email files could not be included."); }
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try { if (file.size > 30 * 1024 * 1024) throw new Error("Choose a backup smaller than 30 MB."); setRestorePreview(parseBackup(JSON.parse(await file.text()))); }
    catch(e) { setNotice((e as Error).message); }
    if (importing.current) importing.current.value = "";
  }
  async function applyRestore(merge: boolean) {
    if (!restorePreview) return;
    const data = restorePreview;
    if (active && !merge && !window.confirm("A shift is running. Replacing will also replace this timer with the backup timer. Continue?")) return;
    try {
      const receipts = decodeSubmissions(data.submissions);
      const combined = merge ? [...shifts, ...data.shifts.filter(s => !shifts.some(v => v.id === s.id || v.start === s.start && v.end === s.end))] : data.shifts;
      const restored = { ...snapshot(), shifts: combined, active: merge ? active : data.active || null, noteDraft: merge ? noteInput : data.noteDraft || "", payroll: merge ? payroll : data.payroll || payroll, dayDetails: merge ? { ...data.dayDetails, ...dayDetails } : data.dayDetails || {}, workZone: merge ? workZone : data.workZone || workZone, templates: merge ? templates : validateTemplates(data.templates ?? templates) };
      await persist(restored, receipts);
      setShifts(restored.shifts); setActive(restored.active); setNoteInput(restored.noteDraft); setPayroll(restored.payroll); setDayDetails(restored.dayDetails); setTemplates(restored.templates); setWorkZone(restored.workZone); setLastSavedShift(null); setRestorePreview(null); setNotice(merge ? "Backup merged. Existing shifts, templates and timer were kept." : "Backup restored. Email history was preserved and merged.");
    } catch(e) { setNotice((e as Error).message); }
  }

  if (bootError) return <main className="recovery-screen"><h1>Your data needs attention.</h1><p>{bootError}</p><button className="secondary-btn" onClick={async () => { const saved=await loadState().catch(() => null); download("routehours-original-data.json", saved?.data ? JSON.stringify(saved.data,null,2) : localStorage.getItem(STORAGE_KEY) || "{}", "application/json"); }}>Download original browser data</button><label>Restore a valid backup<input type="file" accept=".json" onChange={async e => { try { const f=e.target.files?.[0]; if (!f) return; const value=JSON.parse(await f.text()); validateBackup(value); const receipts=decodeSubmissions(value.submissions); if (!window.confirm("Use this backup to recover your records? Download the original first.")) return; const latest=await loadState(); await saveState(readStored(value),latest.revision,receipts); location.reload(); } catch(e) { setBootError((e as Error).message); } }}/></label></main>;

  if (!loaded) return <div className="loading-screen"><div className="loading-orb"/><span>RouteHours</span></div>;

  return <div className="app-shell">

    <header className="topbar container">
      <div className="brand"><div className="brand-mark"><Activity size={22} strokeWidth={2.6}/></div><div><strong>RouteHours</strong><span>Your time, simply.</span></div></div>
      <div className="top-actions"><span className="today-pill"><CalendarDays size={15}/>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(now))}</span>{!installed && <button className="install-top" onClick={() => void openInstall()}><Download size={16}/> Install</button>}<button className="icon-btn theme-button" aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>{isDarkTheme ? <Sun size={19}/> : <Moon size={19}/>}</button><button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button></div>
    </header>

    <OfflineStatus online={online}/>
    <main className="container main-grid" data-view={view}>
      {view === "today" ? <div className="today-view">
        <div className="page-heading"><h1>{active ? "Shift in progress" : savedShift ? "Shift saved" : "Ready when you are"}</h1><p className="page-date">{new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:workZone}).format(new Date(now))}</p></div>
        <section id="timer" className={`timer-card ${active ? "is-active" : ""}`} aria-label="Shift timer">
          <div className="timer-card-top"><span className="card-kicker"><span className="status-dot"/>{active ? "Recording time" : "Ready"}</span><span className="timer-zone">{workZone.split("/").pop()?.replaceAll("_"," ")}</span></div>
          <div className="timer-center"><div className="timer-digits" aria-live="off">{active ? clock(activeSeconds) : "00:00:00"}</div><span className="timer-sub">{active ? `Started at ${formatTime(active.start)}` : "Start when you get on the bus"}</span></div>
          {active && <div className="inline-note"><div className="note-label"><strong>Quick note</strong><span>Private by default</span></div><div className="note-compose"><textarea id="quick-note-input" aria-label="Shift note" value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Anything worth remembering?" maxLength={2000}/><button type="button" className={`assistant-mic ${voiceTarget.current === "general" && (recording || listening) ? "is-active" : ""}`} aria-label={voiceTarget.current === "general" && (recording || listening) ? "Stop note recording" : "Dictate a note"} aria-pressed={voiceTarget.current === "general" && (recording || listening)} disabled={transcribing || micStarting || (recording || listening) && voiceTarget.current !== "general"} onClick={toggleNoteMic}>{recording || listening ? <MicOff size={20}/> : <Mic size={20}/>}</button></div>{voiceStatus("general")}<div className="note-tools"><button className="text-action" onClick={() => { setAssistantOpen(true); document.getElementById("help-panel")?.setAttribute("open",""); document.getElementById("assistant")?.scrollIntoView({behavior:"smooth"}); }}>Help with a note <Sparkles size={13}/></button><button className="text-action" disabled={!cleanNoteDraft(noteInput)} onClick={addNote}><Plus size={15}/> Save note</button></div>{active.notes.length > 0 && <details className="saved-notes"><summary>{active.notes.length} saved {active.notes.length === 1 ? "note" : "notes"}</summary>{active.notes.map((n,i) => <div className="note-item" key={i}><p>{n}</p><button className="icon-btn" aria-label="Remove note" onClick={() => setActive({...active,notes:active.notes.filter((_,j) => j !== i)})}><X size={15}/></button></div>)}</details>}</div>}
          {active && activeSeconds > 12 * 3600 && now - timerCheckedAt > 3600000 && <div className="review-warning"><strong>Still working?</strong><p>This timer has passed 12 hours. Finish and correct the time if you forgot to stop it.</p><button onClick={() => setTimerCheckedAt(now)}>Yes, keep counting</button></div>}
          <button className={`timer-button ${active ? "stop" : "start"}`} disabled={recording || listening || transcribing || micStarting} onClick={active ? stopShift : startShift}>{active ? <><span className="stop-square"/> Finish shift</> : <><Play size={18} fill="currentColor"/> Start shift</>}</button>
          <div className="timer-foot"><ShieldCheck size={14}/>{saveStatus}</div>
        </section>
        {savedShift && <section className="saved-confirmation" aria-live="polite"><div className="confirmation-icon"><Check size={21}/></div><div><strong>Shift saved · {durationLabel(minutesBetween(savedShift.start,savedShift.end))}</strong><p>{formatTime(savedShift.start)} – {formatTime(savedShift.end)}{savedShift.summaryStatus === "pending" && <span> · Preparing summary</span>}</p></div><button onClick={() => openEdit(savedShift)}>Correct</button><button disabled={Boolean(active)} onClick={() => { if(active) return; const current = shifts.find(s => s.id === savedShift.id); if (!current) {setLastSavedShift(null);return;} setShifts(items => items.filter(s => s.id !== current.id)); setActive({start:current.start,notes:current.notes}); setLastSavedShift(null); setNotice("Timer resumed from its recorded start."); }}>Undo</button></section>}
        {!active && !savedShift && sorted[0] && <button className="last-shift-row" onClick={() => openEdit(sorted[0])}><span className="row-icon"><Check size={18}/></span><span><strong>Last shift</strong><small>{formatDay(sorted[0].start)} · {formatTime(sorted[0].start)}–{formatTime(sorted[0].end)}</small></span><b>{durationLabel(minutesBetween(sorted[0].start,sorted[0].end))}</b><ArrowRight size={16}/></button>}
        <button className="week-peek" onClick={() => {setSelectedWeek(currentMonday);setView("history");}}><span><span className="week-peek-label">This week</span><strong>{durationLabel(weekMinutes)}</strong></span><span>{weeklyGoalHours ? `of ${weeklyGoalHours}h goal` : `${weekShifts.length} shifts`}<ArrowRight size={18}/></span></button>
        <details id="help-panel" className="help-panel"><summary><span><Sparkles size={18}/> Ask or log with your voice</span><Plus size={17}/></summary><section id="assistant" className="assistant-card surface" aria-label="Ask RouteHours"><div className="assistant-heading"><span className="assistant-icon"><MessageCircle size={22}/></span><div><h2>A little help.</h2><p>Ask by voice or type. Get help with the app or with structuring a note.</p></div></div><details className="assistant-help"><summary>Suggested questions</summary><div className="assistant-prompts"><button onClick={() => void askAssistant("How do I export and email my hours?")}>Export & email</button><button onClick={() => void askAssistant("How should I structure a useful shift note?")}>Structure a note</button><button onClick={() => void askAssistant("How do I set up Google Sheets?")}>Set up Sheets</button></div></details><form className="assistant-form" onSubmit={e => { e.preventDefault(); void askAssistant(); }}><input value={assistantQuestion} onChange={e => setAssistantQuestion(e.target.value)} maxLength={1200} placeholder={voiceTarget.current === "assistant" && (recording || listening) ? "Listening to your question…" : "Ask a question or describe your hours…"} aria-label="Question for RouteHours"/><button type="button" className={`assistant-mic ${voiceTarget.current === "assistant" && (recording || listening) ? "is-active" : ""}`} aria-label={voiceTarget.current === "assistant" && (recording || listening) ? "Stop question recording" : "Dictate a question"} aria-pressed={voiceTarget.current === "assistant" && (recording || listening)} disabled={transcribing || micStarting || (recording || listening) && voiceTarget.current !== "assistant"} onClick={toggleAssistantMic}>{voiceTarget.current === "assistant" && (recording || listening) ? <MicOff size={18}/> : <Mic size={18}/>}</button><button type="submit" className="assistant-send" disabled={!assistantQuestion.trim() || assistantBusy} aria-label="Ask question"><Send size={18}/></button></form><button className="text-action" disabled={!assistantQuestion.trim()} onClick={() => setVoicePlanText(assistantQuestion)}><Sparkles size={15}/> Turn these words into hours</button>{voiceStatus("assistant")}{(assistantOpen || assistantBusy) && <div className="assistant-reply" aria-live="polite"><div><Sparkles size={17}/><strong>RouteHours guide</strong>{assistantBusy && <span className="mini-spinner"/>}</div>{assistantBusy ? <p>Thinking through your question…</p> : assistantError ? <p className="assistant-error">{assistantError} {(!geminiApiKey && !accessCode) && <button onClick={() => setSettingsOpen(true)}>Open Settings</button>}</p> : <p>{assistantAnswer}</p>}</div>}<small>For note help, your active note draft is sent to Gemini with your question. Leave out identifying details.</small></section></details>
        {!active && <button className="text-action add-past" onClick={() => openEdit()}><Plus size={16}/> Add a past shift</button>}
      </div> : <div className="week-layout"><WeekView week={selectedWeek} onWeek={setSelectedWeek} shifts={shifts} profile={payroll} details={dayDetails} zone={workZone} onReview={() => setWeeklyExportOpen(true)} onEdit={openEdit} onAdd={() => openEdit(undefined, selectedWeek === currentMonday ? todayKey : selectedWeek)} templates={templates} onSettings={() => setSettingsOpen(true)}/><details className="all-history"><summary>All shifts & exports <History size={17}/></summary><section id="history" className="history-section surface"><div className="section-heading history-heading"><div><h2>Shift history</h2></div><div className="history-actions"><button className="secondary-btn" onClick={() => openEdit()}><Plus size={17}/> Add manually</button><div className="export-wrap"><button className="primary-outline" disabled={creatingSheet} onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={17}/> {creatingSheet ? "Creating…" : "Export"} <ChevronDown size={15}/></button>{exportOpen && <div className="export-menu"><button onClick={() => { setWeeklyExportOpen(true); setExportOpen(false); }}><Mail size={18}/><span><strong>Weekly timesheet & email</strong><small>Preview, Excel file or Google Sheets</small></span></button><button onClick={() => exportCsv(false)}><FileSpreadsheet size={18}/><span><strong>Download hours CSV</strong><small>Import into Google Sheets anytime</small></span></button><button onClick={() => exportCsv(true)}><FileSpreadsheet size={18}/><span><strong>Detailed log CSV</strong><small>Includes notes and AI summaries</small></span></button><button onClick={() => { void exportBackup(); setExportOpen(false); }}><ArrowDownToLine size={18}/><span><strong>Backup data</strong><small>Save a copy you can restore later</small></span></button></div>}</div></div></div>
        <div className="history-toolbar"><div className="history-filters" role="group" aria-label="Filter shifts">{([ ["all", "All shifts"], ["week", "This week"], ["month", "This month"] ] as const).map(([value, label]) => <button key={value} className={historyRange === value ? "selected" : ""} aria-pressed={historyRange === value} onClick={() => setHistoryRange(value)}>{label}</button>)}</div><label className="history-search"><Search size={16}/><input value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} placeholder="Search dates or notes" aria-label="Search shifts"/></label></div>
        {shifts.length > 0 && <p className="history-count">Showing {filteredShifts.length} of {shifts.length} shifts · Weekly export lets you choose a week. CSV includes all shifts.</p>}
        {sorted.length === 0 ? <div className="empty-state"><div className="empty-illustration"><Clock3 size={32}/></div><h3>Your shifts will show up here</h3><p>Start the timer for your next bus ride, or add a past shift manually.</p></div> : filteredShifts.length === 0 ? <div className="empty-state filter-empty"><div className="empty-illustration"><Search size={29}/></div><h3>No matching shifts</h3><p>Try another date range or search term.</p><button onClick={() => { setHistoryRange("all"); setHistoryQuery(""); }}>Clear filters</button></div> : <div className="shift-list">{filteredShifts.map(shift => { const open = expanded === shift.id; return <div className={`shift-item ${open ? "expanded" : ""}`} key={shift.id}><button className="shift-summary" onClick={() => setExpanded(open ? null : shift.id)} aria-expanded={open}><span className="shift-date-icon"><CalendarDays size={18}/></span><span className="shift-main"><strong>{formatDay(shift.start)}</strong><small>{formatTime(shift.start)} <ArrowRight size={13}/> {formatTime(shift.end)}</small></span><span className="shift-duration">{durationLabel(minutesBetween(shift.start, shift.end))}</span><ChevronDown className="shift-chevron" size={18}/></button>{open && <div className="shift-detail"><div className="detail-grid"><div><span className="detail-label">STARTED</span><strong>{new Date(shift.start).toLocaleString("en-GB", { timeZone: workZone })}</strong></div><div><span className="detail-label">FINISHED</span><strong>{new Date(shift.end).toLocaleString("en-GB", { timeZone: workZone })}</strong></div><div><span className="detail-label">DECIMAL HOURS</span><strong>{(minutesBetween(shift.start, shift.end) / 60).toFixed(2)} h</strong></div></div><div className="detail-notes"><span className="detail-label">YOUR NOTES</span>{shift.notes.length ? shift.notes.map((note, i) => <p key={i}>• {note}</p>) : <p className="muted">No notes recorded.</p>}</div>{shift.summaryStatus === "pending" && <div className="ai-panel"><Sparkles size={18}/><span>Creating your summary…</span><span className="mini-spinner"/></div>}{shift.summary && <div className="summary-panel"><div className="summary-title"><Sparkles size={17}/> AI SHIFT SUMMARY</div><p>{shift.summary.overview}</p>{([ ["Activities", shift.summary.activities], ["Notable moments", shift.summary.notable], ["Follow-up", shift.summary.followUp] ] as const).map(([title, values]) => values.length > 0 && <div className="summary-group" key={title}><strong>{title}</strong><ul>{values.map((value, i) => <li key={i}>{value}</li>)}</ul></div>)}</div>}{shift.summaryStatus === "error" && shift.summaryError && <p className="summary-error" role="alert">{shift.summaryError}</p>}{(!shift.summary || shift.summaryStatus === "error") && <button className="text-action" onClick={() => retrySummary(shift)}><Sparkles size={16}/>{shift.summaryStatus === "error" ? "Retry AI summary" : "Generate AI summary"}</button>}<div className="shift-controls"><button onClick={() => void copyShiftHours(shift)}><Clipboard size={15}/> Copy hours</button><button onClick={() => openEdit(shift)}><Pencil size={15}/> Edit shift</button><button className="danger" onClick={() => deleteShift(shift.id)}><Trash2 size={15}/> Delete</button></div></div>}</div>; })}</div>}
      </section></details></div>}
      {voiceAction && <div className="voice-confirm"><div><strong>Heard: “{voiceAction.transcript}”</strong><span>Confirm before the timer changes.</span></div><button onClick={confirmVoiceAction}>Confirm {voiceAction.kind}</button><button className="voice-cancel" onClick={() => setVoiceAction(null)} aria-label="Cancel voice command"><X size={17}/></button></div>}
      {sheetUrl && <div className="sheet-success"><FileSpreadsheet size={20}/><span>{sheetShareStatus || "Your Google Sheet is ready."}</span><a href={sheetUrl} target="_blank" rel="noopener noreferrer">Open Google Sheet <ArrowRight size={15}/></a></div>}
    </main>
    <nav className="mobile-dock" data-view={view} aria-label="Main navigation"><span className="dock-indicator" aria-hidden="true"/><button aria-current={view === "today" ? "page" : undefined} onClick={() => {setView("today");window.scrollTo({top:0});}}><Clock3 size={20}/><span>Today</span></button><button aria-current={view === "history" ? "page" : undefined} onClick={() => {setView("history");window.scrollTo({top:0});}}><CalendarDays size={20}/><span>Week</span></button></nav>
    {voicePlanText !== null && <VoiceReview transcript={voicePlanText} shifts={shifts} zone={workZone} apiKey={geminiApiKey} accessCode={accessCode} onClose={() => setVoicePlanText(null)} onApply={value => {setShifts(value);setNotice("Your reviewed changes were recorded.");}}/>}
    {storageError && <div className="modal-backdrop"><div className="modal" role="alertdialog" aria-modal="true" aria-label="Saving paused"><h2>Let's keep your hours safe.</h2><p>{storageError}</p><button className="modal-submit" onClick={() => void exportBackup()}>Download this screen's records</button><button className="secondary-btn" onClick={() => location.reload()}>Reload latest saved version</button></div></div>}
    {restorePreview && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Restore preview"><div className="modal-head"><h2>Restore your hours</h2><button className="icon-btn" aria-label="Cancel restore" onClick={() => setRestorePreview(null)}><X size={20}/></button></div><p>{restorePreview.shifts.length} shifts in this file. You currently have {shifts.length}.</p><p className="report-hint">{restorePreview.createdAt ? "Saved " + new Date(restorePreview.createdAt).toLocaleString("en-GB") + ". " : ""}{restorePreview.templates ? restorePreview.templates.length + " templates. " : ""}{restorePreview.submissions?.length || 0} saved email records.</p><p><b>Merge</b> adds missing shifts and keeps current entries when IDs or times match. <b>Replace</b> uses the backup's shifts, timer, profile and templates. Email records are merged in both cases.</p><button className="modal-submit" onClick={() => void applyRestore(true)}>Merge with my records</button><button className="secondary-btn" onClick={() => void applyRestore(false)}>Replace from backup</button><button className="text-action" onClick={() => void exportBackup()}>Back up current records first</button></div></div>}

    {notice && !weeklyExportOpen && voicePlanText === null && <div className="toast" role="status"><Info size={17}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15}/></button></div>}

    {editing && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Edit shift"><div className="modal-head"><div><h2>{shifts.some(s => s.id === editing.id) ? "Edit shift" : "Add a shift"}</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setEditing(null)}><X size={19}/></button></div><p className="report-hint">{shifts.some(s => s.id === editing.id) ? "Review your recorded times." : "These are suggested times. Check the date and both times before saving."} Times in {workZone}.</p><label>Start date & time<input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)}/></label><label>End date & time<input type="datetime-local" value={editEnd} onChange={e => setEditEnd(e.target.value)}/></label><label>Notes <small>One note per line. Avoid identifying children.</small><textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={5}/></label>{modalError && <p className="form-error">{modalError}</p>}<button className="modal-submit" onClick={saveEdit}>Save shift <ArrowRight size={17}/></button></div></div>}

    {weeklyExportOpen && <WeeklyExport initialWeek={selectedWeek} zone={workZone} shifts={shifts} active={Boolean(active)} profile={payroll} onProfile={setPayroll} details={dayDetails} onDetails={setDayDetails} onClose={closeWeeklyExport} clientId={normalizeClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""} onSettings={() => { setWeeklyExportOpen(false); setSettingsOpen(true); }} onGoogle={(report, email) => { setShareReport(report); setShareRetryId(""); setShareError(""); setWeeklyExportOpen(false); if (email) { setShareRecipient(payroll.email); setShareOpen(true); } else exportGoogleSheet(false, report); }}/> }
    {shareOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !creatingSheet) setShareOpen(false); }}><div className="modal share-modal" role="dialog" aria-modal="true" aria-label="Email Google Sheet"><div className="modal-head"><div><h2>{shareRetryId ? "Finish sharing" : "Create & email"}</h2></div><button className="icon-btn" aria-label="Close" disabled={creatingSheet} onClick={() => setShareOpen(false)}><X size={19}/></button></div><p>{shareRetryId ? "Your Sheet was created. Retry sharing this same file." : "Create a new hours Sheet in your Google Drive and let Google email access to a recipient."}</p><label>Recipient email<input type="email" value={shareRecipient} onChange={e => { setShareRecipient(e.target.value); setShareError(""); }} placeholder="name@example.com" autoComplete="email"/></label><label>Access<select value={shareRole} onChange={e => setShareRole(e.target.value as "reader" | "writer")}><option value="reader">Viewer · can read</option><option value="writer">Editor · can change the Sheet</option></select></label><p className="share-privacy">{shareReport ? `${shareReport.title} · ${shareReport.profile.name || "No name entered"}. Includes times, absence entries, extra remarks${shareReport.includesNotes ? ", shift notes and AI summaries" : ""}.` : "Includes saved hours and dates."} Check the email before sending.</p>{shareError && <p className="form-error" role="alert">{shareError}</p>}{shareRetryId && sheetUrl && <a className="share-existing" href={sheetUrl} target="_blank" rel="noopener noreferrer">Open the created Sheet <ArrowRight size={15}/></a>}<button className="modal-submit" disabled={creatingSheet || !validEmail(shareRecipient)} onClick={() => exportGoogleSheet(true)}>{creatingSheet ? "Working with Google…" : shareRetryId ? "Retry sharing" : "Create & send access"} <Mail size={17}/></button></div></div>}

    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-head"><div><h2>Settings</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setSettingsOpen(false)}><X size={19}/></button></div>
      <div className="setting-block"><div className="setting-title"><span className="setting-icon"><FileSpreadsheet size={19}/></span><div><strong>Timesheet details</strong><p>Filled in automatically on your weekly export.</p></div></div><label>Full name<input value={payroll.name} maxLength={120} onChange={e => { setPayroll({ ...payroll, name: e.target.value }); setSettingsSaved(false); }}/></label><label>Payroll number · Løn-nr.<input value={payroll.number} maxLength={60} onChange={e => { setPayroll({ ...payroll, number: e.target.value }); setSettingsSaved(false); }}/></label><label>Employer email<input type="email" value={payroll.email} maxLength={254} onChange={e => { setPayroll({ ...payroll, email: e.target.value }); setSettingsSaved(false); }}/></label></div>
      <div className="connection-overview"><div><span>Voice</span><strong>{groqConnection?.ok ? "Connected" : groqApiKey ? "Key saved" : "Browser dictation"}</strong></div><div><span>AI</span><strong>{aiConnection?.ok ? "Connected" : geminiApiKey || accessCode ? "Key saved" : "Not set up"}</strong></div><div><span>Google</span><strong>{googleAccount || "Not connected"}</strong></div></div>
      <div className="setting-block"><div className="setting-title"><strong>Your records</strong><span>{saveStatus}</span></div><p>Last backup downloaded: {lastBackup ? new Date(lastBackup).toLocaleString("en-GB") : "Not yet"}</p><button className="secondary-btn" onClick={() => void exportBackup()}><Download size={17}/> Download backup</button><button className="text-action" onClick={async () => { const granted = await navigator.storage?.persist?.(); setNotice(granted ? "Persistent storage granted. Keep external backups too." : "Browser-managed storage is active. Keep an external backup."); }}>Protect device storage</button><label>Work timezone<select value={workZone} onChange={e => {setWorkZone(e.target.value);setSettingsSaved(false);}}>{Array.from(new Set([workZone,"Europe/Copenhagen","Europe/London","Europe/Berlin","Asia/Dubai","America/New_York"])).map(z => <option key={z}>{z}</option>)}</select><small>Used for all displayed hours and weekly exports.</small></label></div>
      <CloudBackup clientId={normalizeClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""} online={online} onSettings={focusGoogleSetup} makeBackup={makeCompleteBackup} onRestore={value => setRestorePreview(parseBackup(value))}/>
      <TemplateSettings templates={templates} onSave={saveTemplates}/>
      <div className="setting-block appearance-settings"><div className="setting-title"><span className="setting-icon"><Moon size={19}/></span><div><strong>Appearance</strong><p>Pick the look that works best for you.</p></div></div><div className="theme-options" role="group" aria-label="Appearance">{([ ["system", "System"], ["light", "Light"], ["dark", "Dark"] ] as const).map(([value, label]) => <button key={value} className={themeMode === value ? "selected" : ""} aria-pressed={themeMode === value} onClick={() => { setThemeMode(value); setSettingsSaved(false); }}>{value === "dark" ? <Moon size={15}/> : value === "light" ? <Sun size={15}/> : <Settings2 size={15}/>} {label}</button>)}</div><label className="goal-setting">Weekly hours goal <small>Optional. Only logged shifts count toward it.</small><div><input type="number" min="0" max="80" step="0.5" value={weeklyGoalHours || ""} onChange={e => { setWeeklyGoalHours(Math.max(0, Math.min(80, Number(e.target.value) || 0))); setSettingsSaved(false); }} placeholder="No goal"/><span>hours</span></div></label></div>
      <div className="setting-block">
        <div className="setting-title"><span className="setting-icon"><Sparkles size={19}/></span><div><strong>Automatic AI summaries</strong><p>Organize your notes when you stop a shift.</p></div><button className={`toggle ${aiEnabled ? "on" : ""}`} role="switch" aria-checked={aiEnabled} aria-label="Automatic AI summaries" onClick={() => { setAiEnabled(!aiEnabled); setSettingsSaved(false); }}><span/></button></div>
        <label className="access-label">Gemini API key <small>Get yours from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.</small><input type="password" value={geminiApiKey} onChange={e => { setGeminiApiKey(e.target.value); setAiEnabled(false); setAiConnection(null); setSettingsSaved(false); }} placeholder="Paste your Gemini API key" autoComplete="off" spellCheck={false}/></label>
        <div className="ai-connection-actions"><button className="modal-submit" disabled={checkingAi || !(geminiApiKey.trim() || accessCode.trim())} onClick={() => void testAiConnection()}>{checkingAi ? "Checking Gemini…" : "Test & connect Gemini"} <Sparkles size={16}/></button>{geminiApiKey && <button className="clear-key" onClick={() => { setGeminiApiKey(""); setAiEnabled(false); setAiConnection(null); setSettingsSaved(false); }}>Remove key</button>}</div>
        {aiConnection && <p className={`connection-result ${aiConnection.ok ? "success" : "error"}`} role="status">{aiConnection.ok ? <Check size={17}/> : <X size={17}/>} {aiConnection.message}</p>}
        <details className="advanced-ai"><summary>Using a server access code instead?</summary><label>Server access code<input type="password" value={accessCode} onChange={e => { setAccessCode(e.target.value); setAiConnection(null); setSettingsSaved(false); }} placeholder="Only if configured in Vercel" autoComplete="off"/></label><p>This needs GEMINI_API_KEY and APP_ACCESS_TOKEN set on the server. A Gemini API key belongs in the field above.</p></details>
        <p className="privacy-note"><LockKeyhole size={16}/>Your key stays in this browser and is excluded from backups. RouteHours sends it through its server to Google when you test or create a summary. Use only de-identified, work-approved notes.</p>
      </div>
      <div className="setting-block">
        <div className="setting-title"><span className="setting-icon"><Mic size={19}/></span><div><strong>Voice dictation with Groq</strong><p>Fast speech to text for your notes and voice commands.</p></div></div>
        <label className="access-label">Groq API key <small>Get yours from <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq Console</a>.</small><input type="password" value={groqApiKey} onChange={e => { setGroqApiKey(e.target.value); setGroqConnection(null); setSettingsSaved(false); }} placeholder="Paste your Groq API key" autoComplete="off" spellCheck={false}/></label>
        <label className="dictation-language">Dictation language<select value={dictationLanguage} onChange={e => { setDictationLanguage(e.target.value as DictationLanguage); setSettingsSaved(false); }}><option value="auto">Detect automatically</option><option value="en">English</option><option value="da">Danish</option><option value="ar">Arabic</option></select></label>
        <div className="ai-connection-actions"><button className="modal-submit groq-test" disabled={checkingGroq || !groqApiKey.trim()} onClick={() => void testGroqConnection()}>{checkingGroq ? "Checking Groq…" : "Test Groq key"} <Mic size={16}/></button>{groqApiKey && <button className="clear-key" onClick={() => { setGroqApiKey(""); setGroqConnection(null); setSettingsSaved(false); }}>Remove key</button>}</div>
        {groqConnection && <p className={`connection-result ${groqConnection.ok ? "success" : "error"}`} role="status">{groqConnection.ok ? <Check size={17}/> : <X size={17}/>} {groqConnection.message}</p>}
        <p className="privacy-note"><LockKeyhole size={16}/>With a Groq key saved, the mic records up to one minute and sends that audio to Groq when you finish. RouteHours keeps the text, not the audio. Speak only your own notes and avoid identifying children.</p>
      </div>
      <GoogleSetup clientId={googleClientId} onChange={value => {setGoogleClientId(value);setGoogleAccount("");setGoogleError("");setSettingsSaved(false);setSettingsSaveError("");}} onSave={() => void saveSettings()} connectedEmail={googleAccount} onConnect={() => void connectGoogle()} connecting={googleConnecting} online={online} error={googleError}/>
      <div className="setting-block"><div className="setting-title"><span className="setting-icon"><RotateCcw size={19}/></span><div><strong>Restore a backup</strong><p>Preview a backup, then merge or replace your hours.</p></div></div><input ref={importing} type="file" accept="application/json,.json" className="sr-only" onChange={e => void importBackup(e.target.files?.[0])}/><button className="secondary-btn restore-btn" onClick={() => importing.current?.click()}>Choose backup file <ArrowRight size={16}/></button></div>
      <div className="settings-save-bar"><button className="modal-submit" onClick={saveSettings}><Check size={17}/> Save settings</button>{settingsSaved && <span className="settings-saved" role="status"><Check size={15}/> Saved on this device.</span>}{settingsSaveError && <span className="settings-save-error" role="alert">{settingsSaveError}</span>}</div>
    </div></div>}
    {installOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setInstallOpen(false); }}><div className="modal install-modal" role="dialog" aria-modal="true" aria-label="Install RouteHours"><div className="modal-head"><div><h2>Install RouteHours</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setInstallOpen(false)}><X size={19}/></button></div><p>Open your deployed RouteHours website in your phone browser, then add it to your Home Screen:</p><div className="install-steps"><strong>iPhone · Safari</strong><ol><li>Tap Share.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Turn on <b>Open as Web App</b>, then tap Add.</li></ol></div><div className="install-steps"><strong>Android · Chrome</strong><ol><li>Tap the three-dot menu.</li><li>Tap <b>Install app</b> or <b>Install and create shortcut</b>.</li><li>Confirm Install.</li></ol></div><p className="install-fine">Use the new Home Screen icon for your shifts. Your records stay in that browser installation, so export a backup regularly.</p></div></div>}
  </div>;
}
