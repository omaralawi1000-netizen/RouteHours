"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, LazyMotion, domMax, MotionConfig, m, useReducedMotion } from "motion/react";
import { CalendarDays, Download, RotateCcw, Settings2, Sun, WifiOff } from "lucide-react";
import { addDays, dateInZone, dayLedger, mondayOf, periodMinutes, shiftWarnings, timeInZone, zonedInstant } from "@/lib/ledger";
import { normalizeGoogleClientId } from "@/lib/google-auth";
import { allSubmissions, reportFingerprint, type Submission } from "@/lib/storage";
import { buildWeeklyReport } from "@/lib/timesheet";
import { templateShift } from "@/lib/templates";
import type { Shift } from "@/lib/time";
import { AppDataProvider, useAppData } from "../state/app-data";
import { useOnlineStatus } from "../offline-status";
import { useGoogleSession } from "../use-google-session";
import { useToday } from "../features/use-now";
import { useBackups } from "../features/use-backups";
import { useInstall } from "../features/use-install";
import { useShiftSummaries } from "../features/use-shift-summaries";
import Button from "../ui/button";
import Glass from "../ui/glass";
import Sheet from "../ui/sheet";
import type { WeekStatus } from "../ui/status-pill";
import TabBar from "../ui/tab-bar";
import Toast, { type ToastMessage } from "../ui/toast";
import Wallpaper from "../ui/wallpaper";
import { SCENES, sceneForHour, statusColor, type SceneId } from "../ui/wallpaper-scenes";
import type { DayBar } from "../ui/week-bars";
import type { WeekData } from "../ui/week-strip";
import { setHaptics, tick } from "../ui/haptics";
import { setReducedMotion, tf } from "../ui/motion";
import { installPress } from "../ui/press";
import { screen } from "../lab/stagger";
import { NEED_KEY, useVoice, type Logged } from "./ai";
import { isBool, usePref } from "./prefs";
import { isTravel, LEGACY_TRAVEL_KEY, TRAVEL_KEY } from "./reminders";
import { useAutoFinish, useRun, type NoteTarget } from "./run";
import { downloadOriginalData, recoverFromBackup } from "../screens/boot-screens";
import SendSheet from "./send-sheet";
import Settings from "./settings";
import ShiftSheet from "./shift-sheet";
import Today, { type RecentItem } from "./today";
import { DEFAULT_RATE, hm, nextPart, partsFrom, RATE_KEY, stillDefault, zoneMinutes } from "./usual";
import Week, { type DayMark, type WeekDayRow } from "./week";
import styles from "./home.module.css";

type TabId = "today" | "week" | "settings";
const TAB_ORDER: TabId[] = ["today", "week", "settings"];
/** How many weeks the strip on Week can swipe back through. */
const WEEKS_BACK = 8;
const SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SCENE_KEY = "routehours:wallpaper";
const LEGACY_SCENE_KEY = "routehours:lab-wallpaper";
const LAB_GEMINI_KEY = "routehours:lab-gemini";
const isScene = (v: unknown): v is SceneId | "auto" => v === "auto" || SCENES.some(s => s.id === v);
const isRate = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 2000;

// Made once: a new Intl.DateTimeFormat costs about a millisecond, and the week labels are drawn on every render.
const dayOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const dayAndMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayMonth = (date: string, month = true) => (month ? dayAndMonth : dayOnly).format(Date.parse(`${date}T12:00:00Z`));
/** "9 – 15 Nov", or "27 Oct – 2 Nov" across a month. */
function rangeLabel(monday: string) {
  const sunday = addDays(monday, 6);
  return monday.slice(5, 7) === sunday.slice(5, 7) ? `${dayMonth(monday, false)} – ${dayMonth(sunday)}` : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
}
function isoWeek(monday: string) {
  const thursday = new Date(`${addDays(monday, 3)}T12:00:00Z`);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / (7 * 86400000)) + 1;
}

export default function Home() {
  return <AppDataProvider><Shell/></AppDataProvider>;
}

function Shell() {
  const { data, loaded, bootError, storageError, update } = useAppData();
  const { shifts, workZone: zone, templates, payroll, dayDetails, weeklyGoalHours, geminiApiKey, aiEnabled, accessCode, googleClientId, noteDraft } = data;
  const online = useOnlineStatus();
  const install = useInstall();

  // The look: per-phone preferences, never part of the saved records.
  const [choice, setChoice, choiceRead] = usePref<SceneId | "auto">(SCENE_KEY, "auto", isScene, LEGACY_SCENE_KEY);
  const [blur, setBlur] = usePref("routehours:blur", true, isBool);
  const [reduce, setReduce] = usePref("routehours:reduce-motion", false, isBool);
  // Set before the screens below render, so their springs already know (see setReducedMotion).
  const phoneReduces = useReducedMotion();
  setReducedMotion(reduce || Boolean(phoneReduces));
  useEffect(() => { installPress(); }, []);
  const [haptics, setHapticsOn] = usePref("routehours:haptics", true, isBool);
  const [rate, setRate] = usePref(RATE_KEY, DEFAULT_RATE, isRate);
  const [travel, setTravel] = usePref(TRAVEL_KEY, 20, isTravel, LEGACY_TRAVEL_KEY);
  const [hourNow, setHourNow] = useState(-1);
  useEffect(() => { const tickHour = () => setHourNow(new Date().getHours()); tickHour(); const timer = window.setInterval(tickHour, 60_000); return () => window.clearInterval(timer); }, []);
  const sceneId: SceneId = choice === "auto" ? (hourNow < 0 ? "dusk" : sceneForHour(hourNow)) : choice;
  // Nothing is drawn until this phone's wallpaper is known, so the first frame is already the right scene.
  const lookKnown = choiceRead && hourNow >= 0;
  const scene = SCENES.find(s => s.id === sceneId) ?? SCENES[0];
  const look = scene.tone;
  useEffect(() => { setHaptics(haptics); }, [haptics]);
  function changeScene(next: SceneId | "auto") {
    tick();
    const nextTone = SCENES.find(s => s.id === (next === "auto" ? sceneForHour(new Date().getHours()) : next))?.tone;
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (nextTone !== look && doc.startViewTransition && !reduce && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(() => flushSync(() => setChoice(next)));
    else setChoice(next);
  }

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const recoveryFile = useRef<HTMLInputElement>(null);
  const say = useCallback((text: string, action?: ToastMessage["action"]) => setToast({ id: Date.now(), text, action }), []);

  const [tab, setTab] = useState<TabId>("today");
  const [direction, setDirection] = useState(1);
  const [opened, setOpened] = useState(false);
  // Pages are drawn once the phone has the page and the records, so nothing on them jumps a moment later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  function changeTab(next: TabId) {
    if (next === tab) return;
    setOpened(true);
    setDirection(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 1 : -1);
    setTab(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const run = useRun(say);
  const today = useToday(zone);
  const currentMonday = mondayOf(today);
  const parts = useMemo(() => partsFrom(templates), [templates]);
  useAutoFinish(run, parts, zone);
  const clientId = normalizeGoogleClientId(googleClientId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const google = useGoogleSession(clientId, "google");
  const backups = useBackups({ clientId, online, today, onNotice: say, onRestored: merged => { setEditing(null); if (!merged) run.reset(); } });
  useShiftSummaries({ loaded, aiEnabled, geminiApiKey, accessCode, shifts, update, onNotice: say });

  // A Gemini key pasted in the lab carries over, so it doesn't have to be pasted again.
  const carried = useRef(false);
  useEffect(() => {
    if (!loaded || carried.current) return;
    carried.current = true;
    try { const key = localStorage.getItem(LAB_GEMINI_KEY)?.trim(); if (key && !geminiApiKey) update({ geminiApiKey: key }); } catch { /* nothing to carry over */ }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every week the strip can show, each day with the pieces worked on it.
  const weekData = useMemo(() => Array.from({ length: WEEKS_BACK }, (_, i) => {
    const monday = addDays(currentMonday, (i - WEEKS_BACK + 1) * 7);
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(monday, d), pieces = dayLedger(shifts, date, zone);
      return { date, pieces, minutes: pieces.reduce((sum, p) => sum + p.minutes, 0) };
    });
    return { monday, days, total: days.reduce((sum, d) => sum + d.minutes, 0) };
  }), [shifts, currentMonday, zone]);
  const thisWeek = weekData[WEEKS_BACK - 1];
  const markOf = (date: string) => dayDetails[date]?.syg ? "Syg" as const : dayDetails[date]?.fri ? "Fri" as const : undefined;
  const weeks: WeekData[] = weekData.map((w, i) => ({ label: i === WEEKS_BACK - 1 ? "This week" : rangeLabel(w.monday), days: w.days.map((d, j) => ({ short: SHORT[j], minutes: d.minutes, today: d.date === today })) }));
  const weekDays: DayBar[] = thisWeek.days.map((d, j) => ({ short: SHORT[j], minutes: d.minutes, today: d.date === today, mark: markOf(d.date) }));
  const todayMinutes = thisWeek.days.find(d => d.date === today)?.minutes ?? 0;

  const sorted = useMemo(() => shifts.slice().sort((a, b) => b.start.localeCompare(a.start)), [shifts]);
  function dayName(start: string) {
    const date = dateInZone(start, zone);
    if (date === today) return "Today";
    if (date === addDays(today, -1)) return "Yesterday";
    const index = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    return date > addDays(today, -7) ? LONG[index] : `${LONG[index].slice(0, 3)} ${dayMonth(date)}`;
  }
  const recent: RecentItem[] = sorted.slice(0, 5).map(s => ({ id: s.id, day: dayName(s.start), start: timeInZone(s.start, zone), end: timeInZone(s.end, zone), minutes: Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000), note: s.notes[0] }));
  const dateLabel = useMemo(() => longDate.format(Date.parse(`${today}T12:00:00Z`)), [today]);

  // Week tab: the chosen week, its days and its timesheet status.
  const [weekIndex, setWeekIndex] = useState(WEEKS_BACK - 1);
  const selected = weekData[weekIndex];
  const selectedIds = new Set(selected.days.flatMap(d => d.pieces.map(p => p.shift.id)));
  const weekRows: WeekDayRow[] = selected.days.map((d, j) => ({ date: d.date, name: LONG[j], dateLabel: dayMonth(d.date), minutes: d.minutes, mark: markOf(d.date), today: d.date === today,
    pieces: d.pieces.map(p => ({ id: p.shift.id, start: timeInZone(p.start, zone), end: p.endsAtMidnight ? "24:00" : timeInZone(p.end, zone) })) }));
  const warnings = Array.from(new Set(shiftWarnings(shifts).filter(w => w.ids.some(id => selectedIds.has(id))).map(w => w.message)));
  const [records, setRecords] = useState<Submission[]>([]);
  useEffect(() => {
    const read = () => { void allSubmissions().then(setRecords).catch(() => {}); };
    read(); window.addEventListener("routehours:submissions", read);
    return () => window.removeEventListener("routehours:submissions", read);
  }, []);
  const status: WeekStatus = useMemo(() => {
    const previous = records.filter(r => r.week === selected.monday);
    if (!previous.length) return "draft";
    // The notes switch changes the file, so a send with either setting counts as this week's sheet.
    const prints = [true, false].map(notes => reportFingerprint(buildWeeklyReport(shifts, selected.monday, payroll, dayDetails, notes, zone)));
    const sent = previous.filter(r => r.status === "sent");
    if (sent.some(r => prints.includes(r.fingerprint))) return "sent";
    if (sent.length) return "changed";
    return previous.some(r => prints.includes(r.fingerprint)) ? "reviewed" : "draft";
  }, [records, selected.monday, shifts, payroll, dayDetails, zone]);
  const [statusPulse, setStatusPulse] = useState(0);
  const lastStatus = useRef(status);
  useEffect(() => { if (status === "sent" && lastStatus.current !== "sent") setStatusPulse(p => p + 1); lastStatus.current = status; }, [status]);
  const todayMark: DayMark = dayDetails[today]?.syg ? "syg" : dayDetails[today]?.fri ? "fri" : "worked";
  function changeTodayMark(next: DayMark) {
    tick();
    update(current => ({ dayDetails: { ...current.dayDetails, [today]: { ...current.dayDetails[today], syg: next === "syg" ? current.dayDetails[today]?.syg || "x" : "", fri: next === "fri" ? current.dayDetails[today]?.fri || "x" : "" } } }));
    say(next === "syg" ? "Today marked sick" : next === "fri" ? "Today marked as day off" : "Mark removed");
  }

  // Editing one shift, or adding one.
  const [editing, setEditing] = useState<{ shift: Shift; isNew: boolean } | null>(null);
  function openShift(id: string) { const shift = shifts.find(s => s.id === id); if (shift) setEditing({ shift, isNew: false }); }
  function addShift(date = today) {
    const first = templates.slice().sort((a, b) => a.start.localeCompare(b.start))[0];
    let shift: Shift;
    try { shift = first ? templateShift(first, date, zone) : { id: crypto.randomUUID(), start: zonedInstant(`${date}T06:00`, zone), end: zonedInstant(`${date}T14:00`, zone), notes: [] }; }
    catch { shift = { id: crypto.randomUUID(), start: zonedInstant(`${date}T06:00`, zone), end: zonedInstant(`${date}T14:00`, zone), notes: [] }; }
    setEditing({ shift, isNew: true });
  }
  const willSummarize = aiEnabled && Boolean(geminiApiKey || accessCode);
  function saveShift(next: Shift) {
    const wasNew = editing?.isNew;
    const original = editing?.shift;
    setEditing(null);
    if (!wasNew && next === original) return;
    const shift = next !== original && willSummarize && next.notes.length ? { ...next, summaryStatus: "pending" as const } : next;
    update(current => ({ shifts: wasNew ? [shift, ...current.shifts] : current.shifts.map(s => s.id === shift.id ? shift : s) }));
    say(wasNew ? `Shift added · ${hm((Date.parse(shift.end) - Date.parse(shift.start)) / 60000)}` : "Shift updated");
  }
  function deleteShift(gone: Shift) {
    setEditing(null);
    update(current => ({ shifts: current.shifts.filter(s => s.id !== gone.id) }));
    say("Shift deleted", { label: "Undo", onClick: () => { update(current => current.shifts.some(s => s.id === gone.id) ? {} : { shifts: [gone, ...current.shifts] }); say("Shift restored"); } });
  }

  // Notes while driving: typed here, or spoken into the mic.
  const [notesOpen, setNotesOpen] = useState(false);
  // During a shift the typed note is the saved draft, so a reload keeps it and Finish adds it. Otherwise it stays on screen.
  const [loose, setLoose] = useState("");
  const noteText = run.active ? noteDraft : loose;
  const setNoteText = (value: string) => { if (run.active) update({ noteDraft: value }); else setLoose(value); };
  const liveNotes = run.active?.notes ?? [];
  function needKey() { say(NEED_KEY, { label: "Settings", onClick: () => changeTab("settings") }); }
  // The shift is picked when recording starts, so a note never lands on a shift started while it was written down.
  const noteTo = useRef<NoteTarget | null>(null);
  const voice = useVoice({
    apiKey: geminiApiKey,
    onText: text => { if (run.addNote(text, noteTo.current)) say(`Note added: ${text}`); else say("Start a shift first, then add the note"); },
    onError: message => message === NEED_KEY ? needKey() : say(message),
  });

  // The week being reviewed is fixed when the sheet opens, so a prepared email still sends that
  // week even if the calendar rolls over to a new week (Sunday midnight) while the sheet is open.
  const [reviewWeek, setReviewWeek] = useState<string | null>(null);
  const reviewing = reviewWeek !== null;
  const setReviewing = (open: boolean) => setReviewWeek(open ? selected.monday : null);
  // A sheet covers the bottom of the screen, so an older message would sit on top of its fields.
  const sheetOpen = reviewing || !!editing || notesOpen || !!backups.restorePreview;
  useEffect(() => { if (sheetOpen) setToast(null); }, [sheetOpen]);

  // A tap on a reminder or a home-screen shortcut lands here: ?do=start, or a message from the service worker.
  const fromReminder = useRef<(action: string) => void>(() => {});
  useEffect(() => { fromReminder.current = action => {
    if (action === "start") {
      if (run.running) { say("Already on shift"); return; }
      const part = nextPart(parts, zoneMinutes(Date.now(), zone));
      run.start(part ?? undefined); say(part ? `${part.label} shift started. Usually done at ${part.end}.` : "Shift started");
    } else if (action === "finish") { if (run.running) run.finish(); else say("No shift is running"); }
    else if (action === "still") { if (run.running) run.keepDriving(); else say("No shift is running"); }
  }; });
  const pendingAction = useRef<string | null>(null);
  useEffect(() => {
    const action = new URLSearchParams(location.search).get("do");
    if (action) { history.replaceState(null, "", location.pathname); pendingAction.current = action; }
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "REMINDER_ACTION") fromReminder.current(String(event.data.action)); };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);
  // Act on a ?do= only once the records (and a running shift) have loaded.
  useEffect(() => {
    if (!loaded || !pendingAction.current) return;
    const action = pendingAction.current; pendingAction.current = null;
    const timer = window.setTimeout(() => fromReminder.current(action), 400);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  // What "Ask your hours" and the payslip check know: every day on the strip, with its date.
  /** The AI endpoint takes up to 6,000 characters, so the day totals always fit and notes are trimmed to what's left. */
  function hoursContext() {
    const days = weekData.flatMap(w => w.days);
    const recentLines = sorted.slice(0, 12).map(s => `${dateInZone(s.start, zone)} ${timeInZone(s.start, zone)}-${timeInZone(s.end, zone)}${s.notes.length ? `, notes: ${s.notes.join("; ").replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
    const head = [
      `Today is ${dateLabel} ${today.slice(0, 4)}.`,
      `Hourly pay ${rate} kr before tax. Weekly goal ${weeklyGoalHours ? `${weeklyGoalHours} hours` : "none"}. Days listed start ${days[0].date}; ask about earlier days and say they are not listed.`,
      `Usual day: ${parts.map(p => `${p.label} ${p.start}-${p.end}`).join(", ") || "not set"}.`,
      "Days (date: hours worked, mark):",
      ...days.map(d => `${d.date} ${LONG[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7].slice(0, 3)}: ${hm(d.minutes)}${markOf(d.date) ? ` ${markOf(d.date)}` : ""}`),
      run.active ? `A shift is running since ${timeInZone(run.active.start, zone)}.` : "",
      "Recent shifts:",
    ].filter(Boolean).join("\n");
    let context = head;
    for (const line of recentLines) { if (context.length + line.length + 1 > 5900) break; context += `\n${line}`; }
    return context;
  }
  function logged(from: string, to: string): Logged {
    const first = sorted.at(-1);
    if (!first) return { minutes: 0, from: null };
    const earliest = dateInZone(first.start, zone);
    const start = from > earliest ? from : earliest;
    return { minutes: start <= to ? periodMinutes(shifts, start, addDays(to, 1), zone) : 0, from: start <= to ? start : null };
  }

  const running = run.running;
  const warm = running && !run.onBreak;
  // The phone's status bar takes the colour of the wallpaper's top edge, for every theme and state.
  useEffect(() => {
    const color = statusColor(scene, warm);
    document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color]").forEach(meta => { meta.removeAttribute("media"); meta.content = color; });
    document.documentElement.style.background = color;
    document.documentElement.style.setProperty("--page-bg", color);
  }, [scene, warm]);
  const ready = mounted && loaded && lookKnown;
  return <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div className={`look ${styles.lab}`} data-look={look} data-ready={lookKnown ? undefined : "no"} data-state={running ? "running" : "idle"} data-blur={blur ? "on" : "off"} data-motion={reduce ? "reduced" : "full"}>
        {lookKnown && <Wallpaper scene={sceneId} state={warm ? "running" : "idle"}/>}
        {bootError ? <main className={styles.page}>
          <Glass blur className={styles.card}>
            <h1 className={`${styles.cardTitle} serif`}>Your data needs attention</h1>
            <p className={styles.hint}>{bootError}</p>
            <p className={styles.hint}>Nothing has been deleted. Download the data as it is first, then restore a backup file. Both work offline.</p>
            <Button variant="glass" icon={<Download/>} onClick={() => void downloadOriginalData()}>Download original data</Button>
            <Button variant="glass" icon={<RotateCcw/>} onClick={() => recoveryFile.current?.click()}>Restore a backup file</Button>
            <input ref={recoveryFile} type="file" accept=".json,application/json" hidden aria-label="Backup file" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await recoverFromBackup(f); } catch (error) { say((error as Error).message); } }}/>
          </Glass>
        </main> : <>
          <div className={styles.pages}>
            <AnimatePresence initial={true} custom={direction}>
              {ready && <m.main key={tab} className={styles.page} custom={direction} variants={screen} initial={opened ? "enter" : "hidden"} animate="show" exit="leave">
                {tab === "today" && <Today run={run} zone={zone} parts={parts} rate={rate} goalMinutes={Math.round(weeklyGoalHours * 60)} dateLabel={dateLabel}
                  weekMinutes={thisWeek.total} todayMinutes={todayMinutes} weekDays={weekDays} recent={recent} dayOff={todayMark !== "worked"} travel={travel}
                  mic={voice.mic} level={voice.level} micSeconds={voice.seconds} onMic={() => { if (voice.mic === "idle") noteTo.current = run.noteTarget(); voice.toggle(); }} defaults={stillDefault(templates)}
                  onAddPast={() => addShift()} onOpenShift={openShift} onNotes={() => setNotesOpen(true)} onSettings={() => changeTab("settings")} noteCount={liveNotes.length}/>}
                {tab === "week" && <Week weeks={weeks} index={weekIndex} onIndex={setWeekIndex} title={`Week ${isoWeek(selected.monday)} · ${rangeLabel(selected.monday)}`} days={weekRows} total={selected.total} rate={rate}
                  warnings={warnings} status={status} statusPulse={statusPulse} isCurrent={weekIndex === WEEKS_BACK - 1} todayMark={todayMark} onTodayMark={changeTodayMark}
                  onOpenShift={openShift} onAddShift={addShift} onReview={() => setReviewing(true)}
                  apiKey={geminiApiKey} context={hoursContext} logged={logged} say={say} onNeedKey={needKey}/>}
                {tab === "settings" && <Settings say={say} rate={rate} onRate={setRate} travel={travel} onTravel={setTravel} backups={backups} online={online} clientId={clientId}
                  google={{ email: google.account?.email ?? "", saved: google.savedEmail }} install={install}
                  look={{ choice, sceneName: scene.name, sceneId, onScene: changeScene, blur, onBlur: setBlur, reduce, onReduce: setReduce, haptics, onHaptics: setHapticsOn }}/>}
              </m.main>}
            </AnimatePresence>
          </div>

          <AnimatePresence>{ready && !online && <m.p key="offline" className={styles.offline} role="status" initial={{ opacity: 0, transform: tf({ y: -8 }) }} animate={{ opacity: 1, transform: tf() }} exit={{ opacity: 0 }}><WifiOff aria-hidden="true"/> Offline · still saving on this phone</m.p>}</AnimatePresence>
          {ready && <TabBar value={tab} onChange={changeTab} tabs={[{ id: "today", label: "Today", icon: <Sun/> }, { id: "week", label: "Week", icon: <CalendarDays/> }, { id: "settings", label: "Settings", icon: <Settings2/> }]}/>}

          <ShiftSheet shift={editing?.shift ?? null} isNew={!!editing?.isNew} shifts={shifts} zone={zone} onClose={() => setEditing(null)} onSave={saveShift} onDelete={deleteShift}/>
          <SendSheet open={reviewing} onClose={() => setReviewing(false)} week={reviewWeek ?? selected.monday} zone={zone} shifts={shifts} running={running}
            profile={payroll} onProfile={value => update({ payroll: value })} details={dayDetails} onDetails={value => update({ dayDetails: value })}
            templates={templates} onShifts={change => update(current => ({ shifts: change(current.shifts) }))} clientId={clientId} online={online} rate={rate} say={say}
            onSettings={() => { setReviewing(false); changeTab("settings"); }}/>
          <Sheet open={notesOpen} onClose={() => setNotesOpen(false)} title="Notes on this shift">
            <div className={styles.sheetForm}>
              {liveNotes.length ? <ul className={styles.noteList}>{liveNotes.map((note, i) => <li key={i}>{note}</li>)}</ul> : <p className={styles.hint}>Nothing yet. Route, bus number, anything worth remembering.</p>}
              <form className={styles.form} onSubmit={event => { event.preventDefault(); if (run.addNote(noteText)) { setNoteText(""); say("Note added"); } }}>
                <label className={`${styles.field} ${styles.wide}`}><span>New note</span><textarea rows={2} value={noteText} maxLength={1000} onChange={e => setNoteText(e.target.value)} placeholder="Route 2A, bus 1123"/></label>
                <Button variant="primary" type="submit" className={styles.wide} disabled={!noteText.trim()}>Add note</Button>
              </form>
            </div>
          </Sheet>
          <Sheet open={!!backups.restorePreview} onClose={() => backups.setRestorePreview(null)} title="Restore your hours">
            {backups.restorePreview && <div className={styles.sheetForm}>
              <p>{backups.restorePreview.shifts.length} shifts in this file. You have {shifts.length} now.</p>
              <p className={styles.hint}>{backups.restorePreview.createdAt ? `Saved ${new Date(backups.restorePreview.createdAt).toLocaleString("en-GB")}. ` : ""}Merge adds the shifts you&apos;re missing and keeps everything you have. Replace uses the file&apos;s shifts, timer, profile and usual shifts. Sent-email records are kept either way.</p>
              <Button variant="primary" onClick={() => void backups.applyRestore(true)}>Merge with my records</Button>
              <Button variant="glass" icon={<RotateCcw/>} onClick={() => void backups.applyRestore(false)}>Replace from the file</Button>
              <Button variant="glass" icon={<Download/>} onClick={() => void backups.exportBackup()}>Back up what I have first</Button>
            </div>}
          </Sheet>
          <Sheet open={!!storageError} onClose={() => {}} title="Saving paused">
            <div className={styles.sheetForm}>
              <p>{storageError}</p>
              <p className={styles.hint}>Your hours on this screen are safe until you reload. Download them first, then reload to get the latest saved version.</p>
              <Button variant="primary" icon={<Download/>} onClick={() => void backups.exportBackup()}>Download this screen&apos;s records</Button>
              <Button variant="glass" onClick={() => location.reload()}>Reload</Button>
            </div>
          </Sheet>
        </>}
        <Toast message={toast} onDismiss={() => setToast(null)}/>
      </div>
    </MotionConfig>
  </LazyMotion>;
}
