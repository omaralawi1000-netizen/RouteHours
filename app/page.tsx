"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownToLine, ArrowRight, CalendarDays, Check, ChevronDown, Clock3, Download, FileSpreadsheet, Info, LockKeyhole, Mail, MessageCircle, Mic, MicOff, Pause, Pencil, Play, Plus, RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { durationLabel, localDateKey, minutesBetween, shiftsCsv, thisWeekStart, type ActiveShift, type Shift } from "@/lib/time";
import { createGoogleSheet, shareGoogleSheet } from "@/lib/sheets";
import { interpretVoice } from "@/lib/voice";

const STORAGE_KEY = "routehours:v1";
type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type VoiceAction = { kind: "start" | "stop"; transcript: string };
type GoogleTokenClient = { requestAccessToken: () => void };
type GoogleWindow = Window & { google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void; error_callback?: (error: { type?: string }) => void }) => GoogleTokenClient } } } };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type DictationLanguage = "auto" | "en" | "da" | "ar";
type StoredData = { shifts: Shift[]; active: ActiveShift | null; noteDraft: string; aiEnabled: boolean; accessCode: string; geminiApiKey: string; groqApiKey: string; dictationLanguage: DictationLanguage; googleClientId: string };

function readStored(): StoredData {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      shifts: Array.isArray(value?.shifts) ? value.shifts.filter((s: Shift) => s && s.id && s.start && s.end) : [],
      active: value?.active?.start ? value.active : null,
      noteDraft: value?.active?.start && typeof value?.noteDraft === "string" ? value.noteDraft.slice(0, 2000) : "",
      aiEnabled: value?.aiEnabled === true,
      accessCode: typeof value?.accessCode === "string" && !value.accessCode.startsWith("AIza") ? value.accessCode : "",
      geminiApiKey: typeof value?.geminiApiKey === "string" ? value.geminiApiKey : typeof value?.accessCode === "string" && value.accessCode.startsWith("AIza") ? value.accessCode : "",
      groqApiKey: typeof value?.groqApiKey === "string" ? value.groqApiKey : "",
      dictationLanguage: value?.dictationLanguage === "en" || value?.dictationLanguage === "da" || value?.dictationLanguage === "ar" ? value.dictationLanguage : "auto",
      googleClientId: typeof value?.googleClientId === "string" ? value.googleClientId : "",
    };
  } catch { return { shifts: [], active: null, noteDraft: "", aiEnabled: false, accessCode: "", geminiApiKey: "", groqApiKey: "", dictationLanguage: "auto", googleClientId: "" }; }
}

function formatTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatDay(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeClientId(value: string) {
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    const fromJson = parsed?.web?.client_id || parsed?.client_id;
    if (typeof fromJson === "string") return fromJson.trim();
  } catch { /* A plain client ID is expected most of the time. */ }
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function validClientId(value: string) { return /^[\w-]+\.apps\.googleusercontent\.com$/.test(value); }
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }

export default function Home() {
  const [loaded, setLoaded] = useState(false);
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
  const activeRef = useRef<ActiveShift | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderStream = useRef<MediaStream | null>(null);
  const recordingClock = useRef<number | null>(null);
  const recordingLimit = useRef<number | null>(null);
  const recordingStarted = useRef(0);
  const recordingCancelled = useRef(false);
  const recordedChunks = useRef<Blob[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const micStartingRef = useRef(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceAction, setVoiceAction] = useState<VoiceAction | null>(null);
  const [voiceText, setVoiceText] = useState("");

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const saved = readStored();
    setShifts(saved.shifts); setActive(saved.active); setNoteInput(saved.noteDraft); setAiEnabled(saved.aiEnabled); setAccessCode(saved.accessCode); setGeminiApiKey(saved.geminiApiKey); setGroqApiKey(saved.groqApiKey); setDictationLanguage(saved.dictationLanguage); setGoogleClientId(saved.googleClientId); setLoaded(true);
    const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      recordingCancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorderStream.current?.getTracks().forEach(track => track.stop());
      if (recordingClock.current) window.clearInterval(recordingClock.current);
      if (recordingLimit.current) window.clearTimeout(recordingLimit.current);
    };
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); installPrompt.current = event as InstallPrompt; };
    const onInstalled = () => { setInstalled(true); setInstallOpen(false); installPrompt.current = null; };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ shifts, active, noteDraft: noteInput, aiEnabled, accessCode, geminiApiKey, groqApiKey, dictationLanguage, googleClientId })); }
    catch { setNotice("Browser storage is unavailable. Export your hours before closing this page."); }
  }, [loaded, shifts, active, noteInput, aiEnabled, accessCode, geminiApiKey, groqApiKey, dictationLanguage, googleClientId]);

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
  const weekStart = thisWeekStart(new Date(now)).getTime();
  const weekShifts = shifts.filter(s => new Date(s.start).getTime() >= weekStart);
  const weekMinutes = weekShifts.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  const monthKey = localDateKey(new Date(now).toISOString()).slice(0, 7);
  const monthMinutes = shifts.filter(s => localDateKey(s.start).startsWith(monthKey)).reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  const activeSeconds = active ? Math.max(0, Math.floor((now - new Date(active.start).getTime()) / 1000)) : 0;
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(thisWeekStart(new Date(now)));
    date.setDate(date.getDate() + i);
    const minutes = shifts.filter(s => localDateKey(s.start) === localDateKey(date.toISOString())).reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
    return { label: ["M", "T", "W", "T", "F", "S", "S"][i], minutes, today: localDateKey(date.toISOString()) === localDateKey(new Date(now).toISOString()) };
  });
  const maxDaily = Math.max(180, ...weekDays.map(d => d.minutes));

  function startShift() {
    setActive({ start: new Date().toISOString(), notes: [] });
    setNoteInput("");
    setNotice("Shift started. Your timer will keep its place if you close this tab.");
  }
  function stopShift() {
    if (!active) return;
    const end = new Date().toISOString();
    const notes = noteInput.trim() ? [...active.notes, noteInput.trim()] : active.notes;
    const willSummarize = aiEnabled && Boolean(geminiApiKey || accessCode);
    const shift: Shift = { id: crypto.randomUUID(), start: active.start, end, notes, summaryStatus: willSummarize ? "pending" : undefined };
    setShifts(current => [shift, ...current]);
    setActive(null); setNoteInput(""); setExpanded(shift.id);
    setNotice(willSummarize ? "Shift saved. Gemini is preparing your summary below." : "Shift saved. Connect Gemini in Settings to create an AI summary.");
  }
  function addNote() {
    const note = noteInput.trim();
    if (!note || !active) return;
    setActive({ ...active, notes: [...active.notes, note] });
    setNoteInput("");
  }
  function handleVoiceTranscript(transcript: string) {
    const heard = transcript.trim();
    if (!heard) { setNotice("No speech was heard. Tap the microphone and try again."); return; }
    setVoiceText(heard);
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
  function startListening() {
    const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) { setNotice("Voice input is unavailable in this browser. You can still type notes and use the timer."); return; }
    setVoiceAction(null); setVoiceText("");
    const instance = new Speech();
    instance.lang = dictationLanguage === "da" ? "da-DK" : dictationLanguage === "ar" ? "ar-SA" : "en-US";
    instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => handleVoiceTranscript(event.results[0]?.[0]?.transcript || "");
    instance.onerror = event => {
      setListening(false);
      setNotice(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was blocked. Allow microphone access in your browser settings."
        : event.error === "no-speech" ? "I didn't hear anything. Tap the microphone and try again."
          : event.error === "network" ? "Speech recognition needs a connection in this browser. Try again online."
            : "Could not capture speech. Check microphone permission and try again.");
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try { instance.start(); setListening(true); } catch { setListening(false); setNotice("Microphone could not start."); }
  }
  function releaseRecording() {
    if (recordingClock.current !== null) window.clearInterval(recordingClock.current);
    if (recordingLimit.current !== null) window.clearTimeout(recordingLimit.current);
    recordingClock.current = null; recordingLimit.current = null;
    recorderStream.current?.getTracks().forEach(track => track.stop());
    recorderStream.current = null; recorder.current = null;
    setRecording(false);
  }
  async function transcribeRecording(blob: Blob, mimeType: string, key: string, language: DictationLanguage) {
    if (!blob.size || blob.size > 3_000_000) {
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
      handleVoiceTranscript(result.text);
    } catch (error) {
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
      setVoiceAction(null); setVoiceText(""); setRecordSeconds(0);
      instance.start(); setRecording(true);
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
  function openEdit(shift?: Shift) {
    const value = shift || emptyShift();
    setEditing(value); setEditStart(localInput(value.start)); setEditEnd(localInput(value.end)); setEditNotes(value.notes.join("\n")); setModalError("");
  }
  function saveEdit() {
    if (!editing) return;
    const start = new Date(editStart); const end = new Date(editEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setModalError("End time must be later than start time."); return; }
    const updated: Shift = { ...editing, start: start.toISOString(), end: end.toISOString(), notes: editNotes.split("\n").map(s => s.trim()).filter(Boolean), summary: undefined, summaryStatus: undefined, summaryError: undefined };
    setShifts(current => current.some(s => s.id === editing.id) ? current.map(s => s.id === editing.id ? updated : s) : [updated, ...current]);
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
  function saveSettings() {
    const normalizedId = normalizeClientId(googleClientId);
    if (normalizedId && !validClientId(normalizedId)) { setSettingsSaved(false); setSettingsSaveError("This is not a Web application OAuth client ID. Paste the value ending in .apps.googleusercontent.com, or its downloaded JSON file contents."); return; }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ shifts, active, noteDraft: noteInput, aiEnabled, accessCode, geminiApiKey, groqApiKey, dictationLanguage, googleClientId: normalizedId }));
      if (JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")?.googleClientId !== normalizedId) throw new Error("Storage verification failed");
      setGoogleClientId(normalizedId);
      setSettingsSaved(true);
      setSettingsSaveError("");
    } catch {
      setSettingsSaved(false);
      setSettingsSaveError("Could not save on this device. Check that browser storage is allowed.");
    }
  }
  function deleteShift(id: string) {
    if (!window.confirm("Delete this shift? This cannot be undone unless you have a backup.")) return;
    setShifts(current => current.filter(s => s.id !== id));
  }
  function exportCsv(detailed: boolean) {
    if (!shifts.length) return;
    download(`routehours-${monthKey}${detailed ? "-detailed" : "-hours"}.csv`, shiftsCsv(shifts, detailed), "text/csv;charset=utf-8");
    setExportOpen(false);
  }
  function exportGoogleSheet(share = false) {
    const clientId = normalizeClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const google = (window as GoogleWindow).google;
    if (share && !validEmail(shareRecipient)) { setShareError("Enter a valid email address before sharing."); return; }
    if (!clientId) { setExportOpen(false); setShareOpen(false); setSettingsOpen(true); setNotice("Add and save your Google OAuth client ID in Settings first."); return; }
    if (!validClientId(clientId)) { setExportOpen(false); setShareOpen(false); setSettingsOpen(true); setNotice("Check the Google Web application client ID in Settings."); return; }
    if (!google?.accounts?.oauth2) { setShareError("Google sign-in is still loading. Try again in a moment."); setNotice("Google sign-in is still loading. Try again in a moment."); return; }
    setExportOpen(false); setShareError(""); setSheetShareStatus("");
    if (!shareRetryId) setSheetUrl("");
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      error_callback: error => { const message = error.type === "popup_closed" ? "Google sign-in was closed before access was granted." : "Google sign-in could not open. Check the authorized JavaScript origin, then try again."; setShareError(message); setNotice(message); },
      callback: async response => {
        if (!response.access_token) { const message = response.error || "Google access was not granted."; setShareError(message); setNotice(message); return; }
        setCreatingSheet(true);
        try {
          const result = share && shareRetryId ? { id: shareRetryId, url: sheetUrl, complete: true } : await createGoogleSheet(response.access_token, shifts);
          setSheetUrl(result.url);
          if (!result.complete) { setShareError("The Sheet was created, but its hours could not be added. Open it below and try the CSV export."); setNotice("Sheet created without hours. Open the link below."); return; }
          if (share) {
            setShareRetryId(result.id);
            await shareGoogleSheet(response.access_token, result.id, shareRecipient, shareRole);
            setSheetShareStatus(`Google sent a sharing notification to ${shareRecipient.trim()}.`);
            setShareRetryId(""); setShareOpen(false);
            setNotice("Google Sheet created and shared by email.");
          } else { setShareRetryId(""); setNotice("Google Sheet created. Open it from the link below."); }
        } catch (error) { const message = error instanceof Error ? error.message : "Could not create or share Google Sheet."; setShareError(message); setNotice(message); }
        finally { setCreatingSheet(false); }
      },
    });
    try { client.requestAccessToken(); }
    catch { const message = "Google sign-in could not start. Check your OAuth client ID and authorized website origin."; setShareError(message); setNotice(message); }
  }
  async function openInstall() {
    const prompt = installPrompt.current;
    if (!prompt) { setInstallOpen(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    installPrompt.current = null;
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.shifts) || data.shifts.some((s: Shift) => !s.id || !s.start || !s.end)) throw new Error("Invalid backup");
      if (!window.confirm(`Replace your current history with ${data.shifts.length} shifts from this backup?`)) return;
      setShifts(data.shifts); setActive(data.active?.start ? data.active : null);
      setNotice("Backup restored.");
    } catch { setNotice("This file is not a valid RouteHours backup."); }
    if (importing.current) importing.current.value = "";
  }

  if (!loaded) return <div className="loading-screen"><div className="loading-orb"/><span>RouteHours</span></div>;

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar container">
      <div className="brand"><div className="brand-mark"><Activity size={22} strokeWidth={2.6}/></div><div><strong>RouteHours</strong><span>Bus shift tracker</span></div></div>
      <div className="top-actions"><span className="today-pill"><CalendarDays size={15}/>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(now))}</span>{!installed && <button className="install-top" onClick={() => void openInstall()}><Download size={16}/> Install</button>}<button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button></div>
    </header>

    <main className="container main-grid">
      <section className="hero"><div className="eyebrow"><span className="eyebrow-line"/> YOUR WORK, CLEARLY COUNTED</div><h1>Every minute<br/><em>matters.</em></h1><p>A simple place to track your time on the bus, keep useful notes, and leave with a clear record of each shift.</p></section>

      <section className={`timer-card ${active ? "is-active" : ""}`} aria-label="Shift timer">
        <div className="timer-card-top"><span className="card-kicker"><span className="status-dot"/>{active ? "SHIFT IN PROGRESS" : "READY WHEN YOU ARE"}</span><Clock3 size={20}/></div>
        <div className="timer-center"><span className="timer-caption">{active ? "Current shift" : "Your next shift"}</span><div className="timer-digits" aria-live="off">{active ? clock(activeSeconds) : "00:00:00"}</div><span className="timer-sub">{active ? `Started at ${formatTime(active.start)}` : "Tap start when you get on the bus"}</span></div>
        <button className={`timer-button ${active ? "stop" : "start"}`} onClick={active ? stopShift : startShift}>{active ? <><Pause size={20} fill="currentColor"/> Stop & save shift</> : <><Play size={20} fill="currentColor"/> Start shift</>}</button>
        <div className="timer-foot"><ShieldCheck size={15}/>Timer uses actual start and end times, even if you close the tab.</div>
      </section>

      <section className={`voice-studio ${listening || recording ? "is-listening" : ""} ${transcribing ? "is-transcribing" : ""}`} aria-label="Voice controls">
        <div className="voice-studio-glow" aria-hidden="true"/>
        <div className="voice-studio-copy">
          <span className="voice-eyebrow"><span className="voice-live-dot"/>{recording ? `RECORDING · ${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")}` : transcribing ? "GROQ IS TRANSCRIBING" : listening ? "LISTENING NOW" : groqApiKey ? "GROQ DICTATION" : "VOICE SHORTCUTS"}</span>
          <h2>{recording || listening ? "I'm listening." : transcribing ? "Turning speech into text…" : "Say it as you go."}</h2>
          <p>{groqApiKey ? "Tap the mic to dictate a note, command, or question, then tap again. Groq turns it into text." : "Start or stop your shift, add a note, log hours, or ask about the app."}</p>
          <div className="voice-suggestions"><span>“Start shift”</span><span>“Add note…”</span><span>“How do I export?”</span></div>
          <small>{groqApiKey ? "Only record your own speech. Audio is sent to Groq when you finish; leave out children’s names and identifying details." : "Browser speech service may process your voice. Leave out identifying details."}</small>
          {voiceText && !voiceAction && <div className="voice-heard" role="status">Heard: “{voiceText}”</div>}
          {voiceText && !voiceAction && active && interpretVoice(voiceText).kind === "note" && <button className="voice-review" onClick={() => document.getElementById("quick-notes")?.scrollIntoView()}><span>Review note draft</span><ArrowRight size={14}/></button>}
        </div>
        <div className="voice-control">
          <div className="voice-orbit"><span/><span/><span/>
            <button className="voice-orb-button" aria-label={recording || listening ? "Stop recording" : groqApiKey ? "Start Groq dictation" : "Start voice input"} aria-pressed={recording || listening} disabled={transcribing || micStarting} onClick={groqApiKey ? recording ? stopGroqRecording : () => void startGroqRecording() : listening ? () => { recognition.current?.stop(); setListening(false); } : startListening}>{recording || listening ? <MicOff size={30} strokeWidth={2.1}/> : <Mic size={30} strokeWidth={2.1}/>}</button>
          </div>
          <div className="voice-wave" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i}/>)}</div>
          <strong>{recording || listening ? "Tap to finish" : transcribing ? "Please wait…" : micStarting ? "Opening mic…" : groqApiKey ? "Tap to record" : voiceSupported ? "Tap to speak" : "Try voice input"}</strong>
        </div>
      </section>
      {voiceAction && <div className="voice-confirm"><div><strong>Heard: “{voiceAction.transcript}”</strong><span>Confirm before the timer changes.</span></div><button onClick={confirmVoiceAction}>Confirm {voiceAction.kind}</button><button className="voice-cancel" onClick={() => setVoiceAction(null)} aria-label="Cancel voice command"><X size={17}/></button></div>}

      <section className="assistant-card surface" aria-label="Ask RouteHours"><div className="assistant-heading"><span className="assistant-icon"><MessageCircle size={22}/></span><div><span className="small-kicker">APP GUIDE · GEMINI</span><h2>Ask RouteHours</h2><p>Ask by voice or type. Get help with the app or with structuring a note.</p></div></div><div className="assistant-prompts"><button onClick={() => void askAssistant("How do I export and email my hours?")}>Export & email</button><button onClick={() => void askAssistant("How should I structure a useful shift note?")}>Structure a note</button><button onClick={() => void askAssistant("How do I set up Google Sheets?")}>Set up Sheets</button></div><form className="assistant-form" onSubmit={e => { e.preventDefault(); void askAssistant(); }}><input value={assistantQuestion} onChange={e => setAssistantQuestion(e.target.value)} maxLength={1200} placeholder="Ask about hours, notes, voice, or exports…" aria-label="Question for RouteHours"/><button disabled={!assistantQuestion.trim() || assistantBusy} aria-label="Ask question"><Send size={18}/></button></form>{(assistantOpen || assistantBusy) && <div className="assistant-reply" aria-live="polite"><div><Sparkles size={17}/><strong>RouteHours guide</strong>{assistantBusy && <span className="mini-spinner"/>}</div>{assistantBusy ? <p>Thinking through your question…</p> : assistantError ? <p className="assistant-error">{assistantError} {(!geminiApiKey && !accessCode) && <button onClick={() => setSettingsOpen(true)}>Open Settings</button>}</p> : <p>{assistantAnswer}</p>}</div>}<small>For note help, your active note draft is sent to Gemini with your question. Leave out identifying details.</small></section>

      <div className="stats-row">
        <div className="stat-card"><span className="stat-icon mint"><Clock3 size={19}/></span><span className="stat-label">THIS WEEK</span><strong>{durationLabel(weekMinutes)}</strong><small>{weekShifts.length} {weekShifts.length === 1 ? "shift" : "shifts"} logged</small></div>
        <div className="stat-card"><span className="stat-icon peach"><CalendarDays size={19}/></span><span className="stat-label">THIS MONTH</span><strong>{durationLabel(monthMinutes)}</strong><small>{shifts.filter(s => localDateKey(s.start).startsWith(monthKey)).length} shifts logged</small></div>
        <div className="stat-card chart-card"><div className="chart-head"><span className="stat-label">YOUR WEEK AT A GLANCE</span><span>Mon–Sun</span></div><div className="bar-chart">{weekDays.map((day, i) => <div className="bar-col" key={i} title={`${day.minutes} minutes`}><div className="bar-track"><div className={`bar-fill ${day.today ? "today" : ""}`} style={{ height: `${Math.max(day.minutes ? 8 : 3, day.minutes / maxDaily * 100)}%` }}/></div><span>{day.label}</span></div>)}</div></div>
      </div>

      {active && <section id="quick-notes" className="notes-card surface"><div className="section-heading"><div><span className="small-kicker">ON THE ROUTE</span><h2>Quick notes</h2></div><span className="live-badge"><span/> Live shift</span></div><p>Jot down practical details while they are fresh. Avoid children’s names, diagnoses, and identifying information.</p><div className="note-compose"><textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Example: Route ran 10 minutes late; helped everyone get seated safely." maxLength={2000}/><button onClick={addNote} disabled={!noteInput.trim()}><Plus size={18}/> Add note</button></div><small className="draft-hint">Your unfinished note stays here if you close and reopen the app.</small>{active.notes.length > 0 && <div className="note-list">{active.notes.map((note, i) => <div className="note-item" key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{note}</p><button aria-label="Remove note" onClick={() => setActive({ ...active, notes: active.notes.filter((_, n) => n !== i) })}><X size={15}/></button></div>)}</div>}</section>}

      <section className="history-section surface"><div className="section-heading history-heading"><div><span className="small-kicker">YOUR RECORD</span><h2>Shift history</h2></div><div className="history-actions"><button className="secondary-btn" onClick={() => openEdit()}><Plus size={17}/> Add manually</button><div className="export-wrap"><button className="primary-outline" disabled={!shifts.length || creatingSheet} onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={17}/> {creatingSheet ? "Creating…" : "Export"} <ChevronDown size={15}/></button>{exportOpen && <div className="export-menu"><button onClick={() => exportGoogleSheet()}><FileSpreadsheet size={18}/><span><strong>Create Google Sheet</strong><small>Save hours directly to your Drive</small></span></button><button onClick={() => { setShareRetryId(""); setShareError(""); setShareOpen(true); setExportOpen(false); }}><Mail size={18}/><span><strong>Create & email Google Sheet</strong><small>Share a new hours Sheet with someone</small></span></button><button onClick={() => exportCsv(false)}><FileSpreadsheet size={18}/><span><strong>Download hours CSV</strong><small>Import into Google Sheets anytime</small></span></button><button onClick={() => exportCsv(true)}><FileSpreadsheet size={18}/><span><strong>Detailed log CSV</strong><small>Includes notes and AI summaries</small></span></button><button onClick={() => { download("routehours-backup.json", JSON.stringify({ shifts, active }, null, 2), "application/json"); setExportOpen(false); }}><ArrowDownToLine size={18}/><span><strong>Backup data</strong><small>Save a copy you can restore later</small></span></button></div>}</div></div></div>
        {sorted.length === 0 ? <div className="empty-state"><div className="empty-illustration"><Clock3 size={32}/></div><h3>Your shifts will show up here</h3><p>Start the timer for your next bus ride, or add a past shift manually.</p></div> : <div className="shift-list">{sorted.map(shift => { const open = expanded === shift.id; return <div className={`shift-item ${open ? "expanded" : ""}`} key={shift.id}><button className="shift-summary" onClick={() => setExpanded(open ? null : shift.id)} aria-expanded={open}><span className="shift-date-icon"><CalendarDays size={18}/></span><span className="shift-main"><strong>{formatDay(shift.start)}</strong><small>{formatTime(shift.start)} <ArrowRight size={13}/> {formatTime(shift.end)}</small></span><span className="shift-duration">{durationLabel(minutesBetween(shift.start, shift.end))}</span><ChevronDown className="shift-chevron" size={18}/></button>{open && <div className="shift-detail"><div className="detail-grid"><div><span className="detail-label">STARTED</span><strong>{new Date(shift.start).toLocaleString("en-GB")}</strong></div><div><span className="detail-label">FINISHED</span><strong>{new Date(shift.end).toLocaleString("en-GB")}</strong></div><div><span className="detail-label">DECIMAL HOURS</span><strong>{(minutesBetween(shift.start, shift.end) / 60).toFixed(2)} h</strong></div></div><div className="detail-notes"><span className="detail-label">YOUR NOTES</span>{shift.notes.length ? shift.notes.map((note, i) => <p key={i}>• {note}</p>) : <p className="muted">No notes recorded.</p>}</div>{shift.summaryStatus === "pending" && <div className="ai-panel"><Sparkles size={18}/><span>Creating your summary…</span><span className="mini-spinner"/></div>}{shift.summary && <div className="summary-panel"><div className="summary-title"><Sparkles size={17}/> AI SHIFT SUMMARY</div><p>{shift.summary.overview}</p>{([ ["Activities", shift.summary.activities], ["Notable moments", shift.summary.notable], ["Follow-up", shift.summary.followUp] ] as const).map(([title, values]) => values.length > 0 && <div className="summary-group" key={title}><strong>{title}</strong><ul>{values.map((value, i) => <li key={i}>{value}</li>)}</ul></div>)}</div>}{shift.summaryStatus === "error" && shift.summaryError && <p className="summary-error" role="alert">{shift.summaryError}</p>}{(!shift.summary || shift.summaryStatus === "error") && <button className="text-action" onClick={() => retrySummary(shift)}><Sparkles size={16}/>{shift.summaryStatus === "error" ? "Retry AI summary" : "Generate AI summary"}</button>}<div className="shift-controls"><button onClick={() => openEdit(shift)}><Pencil size={15}/> Edit shift</button><button className="danger" onClick={() => deleteShift(shift.id)}><Trash2 size={15}/> Delete</button></div></div>}</div>; })}</div>}
      </section>
      {sheetUrl && <div className="sheet-success"><FileSpreadsheet size={20}/><span>{sheetShareStatus || "Your Google Sheet is ready."}</span><a href={sheetUrl} target="_blank" rel="noopener noreferrer">Open Google Sheet <ArrowRight size={15}/></a></div>}
      <footer className="footer"><div><span className="brand-mini">RH</span> RouteHours</div><span>Shift records stay in this browser; AI and exports send selected data when used.</span></footer>
    </main>

    {notice && <div className="toast" role="status"><Info size={17}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15}/></button></div>}

    {editing && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Edit shift"><div className="modal-head"><div><span className="small-kicker">SHIFT DETAILS</span><h2>{shifts.some(s => s.id === editing.id) ? "Edit shift" : "Add a shift"}</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setEditing(null)}><X size={19}/></button></div><label>Start date & time<input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)}/></label><label>End date & time<input type="datetime-local" value={editEnd} onChange={e => setEditEnd(e.target.value)}/></label><label>Notes <small>One note per line. Avoid identifying children.</small><textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={5}/></label>{modalError && <p className="form-error">{modalError}</p>}<button className="modal-submit" onClick={saveEdit}>Save shift <ArrowRight size={17}/></button></div></div>}

    {shareOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !creatingSheet) setShareOpen(false); }}><div className="modal share-modal" role="dialog" aria-modal="true" aria-label="Email Google Sheet"><div className="modal-head"><div><span className="small-kicker">GOOGLE SHEETS</span><h2>{shareRetryId ? "Finish sharing" : "Create & email"}</h2></div><button className="icon-btn" aria-label="Close" disabled={creatingSheet} onClick={() => setShareOpen(false)}><X size={19}/></button></div><p>{shareRetryId ? "Your Sheet was created. Retry sharing this same file." : "Create a new hours Sheet in your Google Drive and let Google email access to a recipient."}</p><label>Recipient email<input type="email" value={shareRecipient} onChange={e => { setShareRecipient(e.target.value); setShareError(""); }} placeholder="name@example.com" autoComplete="email"/></label><label>Access<select value={shareRole} onChange={e => setShareRole(e.target.value as "reader" | "writer")}><option value="reader">Viewer · can read</option><option value="writer">Editor · can change the Sheet</option></select></label><p className="share-privacy">The Sheet contains hours and dates only. It does not include notes or AI summaries. Check the email before sending.</p>{shareError && <p className="form-error" role="alert">{shareError}</p>}{shareRetryId && sheetUrl && <a className="share-existing" href={sheetUrl} target="_blank" rel="noopener noreferrer">Open the created Sheet <ArrowRight size={15}/></a>}<button className="modal-submit" disabled={creatingSheet || !validEmail(shareRecipient)} onClick={() => exportGoogleSheet(true)}>{creatingSheet ? "Working with Google…" : shareRetryId ? "Retry sharing" : "Create & send access"} <Mail size={17}/></button></div></div>}

    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-head"><div><span className="small-kicker">PREFERENCES</span><h2>Settings</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setSettingsOpen(false)}><X size={19}/></button></div>
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
      <div className="setting-block">
        <div className="setting-title"><span className="setting-icon"><FileSpreadsheet size={19}/></span><div><strong>Google Sheets export</strong><p>Create a new hours spreadsheet in your Drive.</p></div></div>
        <label className="access-label">OAuth client ID <small>Paste the <b>Web application</b> client ID from <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Google Cloud clients</a>. You can also paste its downloaded JSON. Do not paste the client secret.</small><input type="text" value={googleClientId} onChange={e => { setGoogleClientId(e.target.value); setSettingsSaved(false); setSettingsSaveError(""); }} placeholder="...apps.googleusercontent.com" autoComplete="off" autoCapitalize="none" spellCheck={false}/></label>
        {googleClientId && <p className={`id-status ${validClientId(normalizeClientId(googleClientId)) ? "valid" : "invalid"}`}>{validClientId(normalizeClientId(googleClientId)) ? "Client ID format looks right. Save it below, then use Export." : "This does not look like a Web application client ID yet."}</p>}
        <button className="google-save" onClick={saveSettings}><Check size={16}/> Save Google client ID</button>
        <p className="origin-help">In that OAuth client, add <code>{window.location.origin}</code> under <b>Authorized JavaScript origins</b>. Enable both the <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener noreferrer">Google Sheets API</a> and <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Google Drive API</a>. Add your Google account as a test user if the app is in testing.</p>
        <p className="origin-help">An old Web client ID can work when this website origin and both APIs are configured in its Google Cloud project. After saving, use <b>Export</b> to create or email a Sheet.</p>
      </div>
      <div className="setting-block"><div className="setting-title"><span className="setting-icon"><RotateCcw size={19}/></span><div><strong>Restore a backup</strong><p>Replace this browser’s history from a RouteHours JSON file.</p></div></div><input ref={importing} type="file" accept="application/json,.json" className="sr-only" onChange={e => void importBackup(e.target.files?.[0])}/><button className="secondary-btn restore-btn" onClick={() => importing.current?.click()}>Choose backup file <ArrowRight size={16}/></button></div>
      <div className="settings-save-bar"><button className="modal-submit" onClick={saveSettings}><Check size={17}/> Save settings</button>{settingsSaved && <span className="settings-saved" role="status"><Check size={15}/> Saved in this browser. Your settings will still be here when you reopen the app.</span>}{settingsSaveError && <span className="settings-save-error" role="alert">{settingsSaveError}</span>}</div>
    </div></div>}
    {installOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setInstallOpen(false); }}><div className="modal install-modal" role="dialog" aria-modal="true" aria-label="Install RouteHours"><div className="modal-head"><div><span className="small-kicker">ON YOUR PHONE</span><h2>Install RouteHours</h2></div><button className="icon-btn" aria-label="Close" onClick={() => setInstallOpen(false)}><X size={19}/></button></div><p>Open your deployed RouteHours website in your phone browser, then add it to your Home Screen:</p><div className="install-steps"><strong>iPhone · Safari</strong><ol><li>Tap Share.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Turn on <b>Open as Web App</b>, then tap Add.</li></ol></div><div className="install-steps"><strong>Android · Chrome</strong><ol><li>Tap the three-dot menu.</li><li>Tap <b>Install app</b> or <b>Install and create shortcut</b>.</li><li>Confirm Install.</li></ol></div><p className="install-fine">Use the new Home Screen icon for your shifts. Your records stay in that browser installation, so export a backup regularly.</p></div></div>}
  </div>;
}
