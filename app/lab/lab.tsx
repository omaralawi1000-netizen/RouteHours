"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, LazyMotion, domMax, MotionConfig, m } from "motion/react";
import { Check, CalendarDays, FlaskConical, Send, Sun, Trash2 } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
import HoldButton from "../ui/hold-button";
import { type MicState } from "../ui/mic-pill";
import SegmentedControl from "../ui/segmented-control";
import Sheet from "../ui/sheet";
import StatusPill, { type WeekStatus } from "../ui/status-pill";
import TabBar from "../ui/tab-bar";
import Toast, { type ToastMessage } from "../ui/toast";
import Toggle from "../ui/toggle";
import Wallpaper from "../ui/wallpaper";
import { SCENES, type SceneId } from "../ui/wallpaper-scenes";
import { type Break } from "../ui/shift-line";
import { type DayBar } from "../ui/week-bars";
import WeekStrip, { type WeekData } from "../ui/week-strip";
import { setHaptics, tick } from "../ui/haptics";
import { spring, springSpec, type SpringName } from "../ui/motion";
import Today, { clockTime, DAY_PARTS, hm, nextPart, usualDayMinutes, type Layout, type Phase, type RecentShift } from "./today";
import Reminders, { useTravel } from "./reminders";
import { item, screen } from "./stagger";
import styles from "./lab.module.css";

type TabId = "today" | "week" | "lab";

const day = (short: string, minutes: number) => ({ short, minutes });
const WEEKS: WeekData[] = [
  { label: "26 Oct – 1 Nov", days: [day("M", 462), day("T", 445), day("W", 0), day("T", 478), day("F", 431), day("S", 250), day("S", 0)] },
  { label: "2 – 8 Nov", days: [day("M", 470), day("T", 0), day("W", 455), day("T", 488), day("F", 440), day("S", 0), day("S", 0)] },
  { label: "This week", days: [day("M", 465), day("T", 442), day("W", 0), day("T", 0), day("F", 0), day("S", 0), day("S", 0)] },
];
const RECENT: RecentShift[] = [
  { id: 3, day: "Tuesday", start: "06:12", end: "13:34", minutes: 442, note: "Route 2A" },
  { id: 2, day: "Monday", start: "05:48", end: "13:33", minutes: 465, note: "Route 4" },
  { id: 1, day: "Last week", start: "Fri 06:00", end: "13:20", minutes: 440 },
];

type DayMark = "worked" | "syg" | "fri";
const SCENE_KEY = "routehours:lab-wallpaper";
const LAYOUT_KEY = "routehours:lab-layout-v4";
const FONT_KEY = "routehours:lab-font-v2";
const RUN_KEY = "routehours:lab-run";
type FontId = "modern" | "clean" | "character" | "editorial";
const FONTS: { value: FontId; label: string }[] = [{ value: "modern", label: "Modern" }, { value: "clean", label: "Clean" }, { value: "character", label: "Bold" }, { value: "editorial", label: "Serif" }];
const LAYOUTS: { value: Layout; label: string }[] = [{ value: "card", label: "Card" }, { value: "focus", label: "Focus" }, { value: "bento", label: "Tiles" }, { value: "horizon", label: "Sheet" }];
/** Auto wallpaper: dawn sea in the morning, desert by day, dusk hills in the evening, the fjord at night. */
function sceneForHour(hour: number): SceneId { return hour >= 5 && hour < 10 ? "ocean" : hour >= 10 && hour < 16 ? "desert" : hour >= 16 && hour < 21 ? "dusk" : "fjord"; }

export default function Lab() {
  const [choice, setChoice] = useState<SceneId | "auto">("auto");
  const [hourNow, setHourNow] = useState(-1);
  useEffect(() => { const update = () => setHourNow(new Date().getHours()); update(); const timer = window.setInterval(update, 60_000); return () => window.clearInterval(timer); }, []);
  const sceneId: SceneId = choice === "auto" ? (hourNow < 0 ? "dusk" : sceneForHour(hourNow)) : choice;
  const scene = SCENES.find(s => s.id === sceneId) ?? SCENES[0];
  const [layout, setLayout] = useState<Layout>("card");
  const [font, setFont] = useState<FontId>("modern");
  const look = scene.tone;
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SCENE_KEY); if (stored && (stored === "auto" || SCENES.some(s => s.id === stored))) setChoice(stored as SceneId | "auto");
      const storedFont = localStorage.getItem(FONT_KEY); if (storedFont && FONTS.some(f => f.value === storedFont)) setFont(storedFont as FontId);
      const storedLayout = localStorage.getItem(LAYOUT_KEY); if (storedLayout && LAYOUTS.some(l => l.value === storedLayout)) setLayout(storedLayout as Layout);
    } catch { /* private mode: keep the defaults */ }
  }, []);
  const [tab, setTab] = useState<TabId>("today");
  const [blur, setBlur] = useState(true);
  const [reduce, setReduce] = useState(false);
  const [haptics, setHapticsOn] = useState(true);
  const [weight, setWeight] = useState<"300" | "200">("200");

  const [phase, setPhase] = useState<Phase>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [endedAt, setEndedAt] = useState(0);
  const [weekMinutes, setWeekMinutes] = useState(907);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [chipPulse, setChipPulse] = useState(0);
  const [recent, setRecent] = useState(RECENT);
  const [saved, setSaved] = useState<{ minutes: number; startedAt: number; id: number } | null>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, run: () => void) => { timers.current.push(window.setTimeout(run, ms)); };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const say = useCallback((text: string, action?: ToastMessage["action"]) => setToast({ id: Date.now(), text, action }), []);
  const [dateLabel, setDateLabel] = useState("");
  const [todayIndex, setTodayIndex] = useState(-1);
  useEffect(() => {
    setDateLabel(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" }).format(Date.now()));
    setTodayIndex((new Date().getDay() + 6) % 7);
  }, []);
  useEffect(() => { setHaptics(haptics); }, [haptics]);
  useEffect(() => {
    const color = scene.colors["--sky-top"];
    document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color]").forEach(meta => { meta.removeAttribute("media"); meta.content = color; });
    document.documentElement.style.background = color;
  }, [scene]);

  // The sky colours blend on their own. Only a switch between a dark and a light scene changes the text colours, so that one crossfades the page.
  function changeFont(next: FontId) {
    tick(); setFont(next);
    try { localStorage.setItem(FONT_KEY, next); } catch { /* not saved, still applied */ }
  }
  function changeLayout(next: Layout) {
    tick(); setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* not saved, still applied */ }
  }
  function changeScene(next: SceneId | "auto") {
    tick();
    try { localStorage.setItem(SCENE_KEY, next); } catch { /* not saved, still applied */ }
    const nextTone = SCENES.find(s => s.id === (next === "auto" ? sceneForHour(new Date().getHours()) : next))?.tone;
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (nextTone !== look && doc.startViewTransition && !reduce && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(() => flushSync(() => setChoice(next)));
    else setChoice(next);
  }
  const TAB_ORDER: TabId[] = ["today", "week", "lab"];
  const [direction, setDirection] = useState(1);
  const [opened, setOpened] = useState(false);
  // Pages are drawn only once the phone has the page, so nothing on them changes or jumps a moment
  // later (greeting, checks, chips); the wallpaper and tab bar are there from the very first frame.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  function changeTab(next: TabId) {
    if (next === tab) return;
    setOpened(true);
    setDirection(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 1 : -1);
    setTab(next);
    // Jump, don't scroll: the new page slides in at its top while the old one slides away.
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const [breaks, setBreaks] = useState<Break[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [stillDriving, setStillDriving] = useState(false);
  const [travel, setTravel] = useTravel();
  // A running shift survives closing the app, so Finish from a shortcut or a reminder still finds it.
  const restored = useRef(false);
  useEffect(() => {
    try {
      const run = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as { startedAt?: number; breaks?: Break[]; note?: string; stillDriving?: boolean } | null;
      if (run && typeof run.startedAt === "number" && Date.now() - run.startedAt < 16 * 3600000) {
        setStartedAt(run.startedAt); setBreaks(Array.isArray(run.breaks) ? run.breaks : []); setNote(run.note); setStillDriving(!!run.stillDriving); setPhase("running");
      }
    } catch { /* start fresh */ }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (phase === "running") localStorage.setItem(RUN_KEY, JSON.stringify({ startedAt, breaks, note, stillDriving }));
      else if (phase === "idle") localStorage.removeItem(RUN_KEY);
    } catch { /* kept for this visit */ }
  }, [phase, startedAt, breaks, note, stillDriving]);
  function start(withNote?: string) { tick(); setSaved(null); setBreaks([]); setNote(withNote); setStillDriving(false); setStartedAt(Date.now()); setPhase("running"); }
  function startUsual() {
    const part = nextPart();
    if (!part) { logUsualDay(); return; }
    start(part.label); say(`${part.label} shift started. Usually done at ${part.end}.`);
  }
  // Logs the whole usual split day in one go, for days you forgot to press Start.
  function logUsualDay() {
    tick();
    const id = Date.now(), minutes = usualDayMinutes;
    const entry: RecentShift = { id, day: "Today", start: DAY_PARTS[0].start, end: DAY_PARTS[1].end, minutes, note: `${DAY_PARTS[0].start}–${DAY_PARTS[0].end} + ${DAY_PARTS[1].start}–${DAY_PARTS[1].end}` };
    setRecent(list => [entry, ...list]); setWeekMinutes(total => total + minutes); setTodayMinutes(total => total + minutes); setChipPulse(p => p + 1);
    say(`Usual day logged · ${hm(minutes)}`, { label: "Undo", onClick: () => { setRecent(list => list.filter(s => s.id !== id)); setWeekMinutes(total => total - minutes); setTodayMinutes(total => total - minutes); say("Removed"); } });
  }
  function toggleBreak() {
    tick();
    const open = breaks.some(b => !b.end);
    setBreaks(list => open ? list.map(b => b.end ? b : { ...b, end: Date.now() }) : [...list, { start: Date.now() }]);
    if (open) say("Back on the road");
  }
  function finish(at?: number, message?: string) {
    tick();
    const end = at ?? Date.now(), breakMs = breaks.reduce((sum, b) => sum + ((b.end ?? end) - b.start), 0), id = end;
    const minutes = Math.max(1, Math.round((end - startedAt - breakMs) / 60000));
    setBreaks(list => list.map(b => b.end ? b : { ...b, end }));
    setEndedAt(end); setPhase("landing");
    later(420, () => { setWeekMinutes(total => total + minutes); setTodayMinutes(total => total + minutes); setChipPulse(p => p + 1); });
    const record = { minutes, startedAt, id };
    later(1100, () => {
      setPhase("idle"); setSaved(record);
      say(message ?? `Shift saved · ${hm(minutes)} added`, { label: "Undo", onClick: () => undoShift(record) });
      setRecent(list => [{ id, day: "Today", start: clockTime(startedAt), end: clockTime(end), minutes, note }, ...list]);
    });
    later(8000, () => setSaved(current => current?.id === id ? null : current));
  }
  // A tap on a reminder's button lands here: from the link it opened (?do=start) or a message from the service worker.
  const fromReminder = useRef<(action: string) => void>(() => {});
  useEffect(() => { fromReminder.current = action => {
    if (action === "start") { if (phase === "running") say("Already on shift"); else { const part = nextPart(); start(part?.label); say(part ? `${part.label} shift started. Usually done at ${part.end}.` : "Shift started"); } }
    else if (action === "finish") { if (phase === "running") finish(); else say("No shift is running"); }
    else if (action === "still") { if (phase === "running") keepDriving(); else say("No shift is running"); }
  }; });
  useEffect(() => {
    const params = new URLSearchParams(location.search), action = params.get("do");
    if (action) { history.replaceState(null, "", location.pathname); window.setTimeout(() => fromReminder.current(action), 600); }
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "REMINDER_ACTION") fromReminder.current(String(event.data.action)); };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);
  function keepDriving() { setStillDriving(true); say("Got it. It won't finish on its own this run."); }
  function autoFinish(at: number) { finish(at, `Finished on its own at ${clockTime(at)}`); }
  function undoShift(record: { minutes: number; startedAt: number; id: number }) {
    setWeekMinutes(total => total - record.minutes); setTodayMinutes(total => total - record.minutes);
    setRecent(list => list.filter(shift => shift.id !== record.id));
    setStartedAt(record.startedAt); setBreaks(list => list.map((b, i) => i === list.length - 1 && b.end === record.id ? { start: b.start } : b)); setPhase("running"); setSaved(null);
    say("Shift resumed");
  }
  function undoFinish() { if (saved) undoShift(saved); }

  const [status, setStatus] = useState<WeekStatus>("reviewed");
  const [statusPulse, setStatusPulse] = useState(0);
  const [weekIndex, setWeekIndex] = useState(WEEKS.length - 1);
  const [mark, setMark] = useState<DayMark>("worked");
  function changeMark(next: DayMark) {
    tick(); setMark(next);
    say(next === "syg" ? "Today marked sick" : next === "fri" ? "Today marked as day off" : "Mark removed");
  }
  const weeks = WEEKS.map((week, index) => index === WEEKS.length - 1 ? { ...week, days: week.days.map((d, i) => ({ ...d, minutes: i === todayIndex ? d.minutes + todayMinutes : d.minutes, today: i === todayIndex })) } : week);
  const weekDays: DayBar[] = weeks[WEEKS.length - 1].days.map((d, i) => ({ short: d.short, minutes: d.minutes, today: i === todayIndex, mark: i === todayIndex && mark !== "worked" ? (mark === "syg" ? "Syg" : "Fri") : undefined }));
  const [editing, setEditing] = useState<RecentShift | null>(null);
  const lastEditing = useRef<RecentShift | null>(null);
  if (editing) lastEditing.current = editing;
  const sheetShift = editing ?? lastEditing.current;

  const [mic, setMic] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [micSeconds, setMicSeconds] = useState(0);
  useEffect(() => {
    if (mic !== "listening") return;
    const begun = Date.now();
    const timer = window.setInterval(() => {
      setLevel(current => Math.max(0.08, Math.min(1, current * 0.55 + Math.random() * 0.75)));
      setMicSeconds(Math.floor((Date.now() - begun) / 1000));
    }, 90);
    return () => window.clearInterval(timer);
  }, [mic]);
  function toggleMic() {
    if (mic === "idle") { setMicSeconds(0); setLevel(0.3); setMic("listening"); return; }
    if (mic === "listening") { setMic("writing"); window.setTimeout(() => { setMic("idle"); say("Note added: late from Aarhus C, roadworks"); }, 1300); }
  }

  const running = phase === "running";
  return <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div className={`look ${styles.lab}`} data-look={look} data-font={font} data-state={running ? "running" : "idle"} data-blur={blur ? "on" : "off"} data-motion={reduce ? "reduced" : "full"} style={{ ["--number-weight" as string]: weight }}>
        <Wallpaper scene={sceneId} state={running && !breaks.some(b => !b.end) ? "running" : "idle"}/>
        <div className={styles.pages}>
        <AnimatePresence initial={true} custom={direction}>
          {mounted && <m.main key={tab} className={styles.page} custom={direction} variants={screen} initial={opened ? "enter" : "hidden"} animate="show" exit="leave">
            {tab === "today" && <Today phase={phase} startedAt={startedAt} endedAt={endedAt} weekMinutes={weekMinutes} todayMinutes={todayMinutes} chipPulse={chipPulse} dateLabel={dateLabel}
              recent={recent} mic={mic} level={level} micSeconds={micSeconds}
              layout={layout} note={note} breaks={breaks} weekDays={weekDays} onBreak={toggleBreak} onStartUsual={startUsual} onLogUsualDay={logUsualDay} dayOff={mark !== "worked"} stillDriving={stillDriving} onStillDriving={keepDriving} onAutoFinish={autoFinish} travel={travel}
              onUndo={undoFinish} onStart={() => start()} onFinish={() => finish()} onFastForward={() => { setStartedAt(value => value - 3_600_000); setBreaks(list => list.map(b => ({ start: b.start - 3_600_000, end: b.end && b.end - 3_600_000 }))); }} onMic={toggleMic}
              onAddPast={() => setEditing({ id: -1, day: "New", start: "06:00", end: "14:00", minutes: 480 })} onOpenShift={setEditing} onSettings={() => changeTab("lab")}/>}

            {tab === "week" && <>
              <m.header variants={item} className={styles.top}>
                <div><p className={styles.eyebrow}>Week 46 · 9 – 15 Nov</p><h1 className={`${styles.title} serif`}>Your week</h1></div>
              </m.header>
              <m.section variants={item}><Glass blur className={styles.card}><WeekStrip weeks={weeks} index={weekIndex} onIndex={setWeekIndex}/></Glass></m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Today was</h2><span className={styles.cardMeta}>Goes on the timesheet</span></div>
                  <SegmentedControl label="Mark today" value={mark} onChange={changeMark} options={[{ value: "worked", label: "Worked" }, { value: "syg", label: "Sick" }, { value: "fri", label: "Day off" }]}/>
                </Glass>
              </m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Timesheet</h2><StatusPill status={status} pulse={statusPulse}/></div>
                  <div className={styles.sendTotals}>
                    <div><p className={styles.statLabel}>Worked</p><p className={`${styles.sendBig} numeric`}>{hm(weekMinutes)}</p></div>
                    <div><p className={styles.statLabel}>Shifts</p><p className={`${styles.sendBig} numeric`}>{recent.filter(r => r.day !== "Last week").length}</p></div>
                  </div>
                  <HoldButton icon={<Send/>} disabled={status === "sent"} onConfirm={() => { setStatus("sent"); setStatusPulse(p => p + 1); say("Timesheet sent"); }}>{status === "sent" ? "Sent" : "Hold to send timesheet"}</HoldButton>
                  <div className={styles.inline}>
                    <Button variant="quiet" size="small" onClick={() => { setStatus("changed"); setStatusPulse(0); }} disabled={status !== "sent"}>Edit a sent shift</Button>
                    <Button variant="quiet" size="small" onClick={() => { setStatus("reviewed"); setStatusPulse(0); }}>Reset</Button>
                  </div>
                </Glass>
              </m.section>
              <m.p variants={item} className={styles.hint}>Swipe the bars sideways to change week. Sending is the one thing you can&apos;t undo, so you hold it.</m.p>
            </>}

            {tab === "lab" && <>
              <m.header variants={item} className={styles.top}>
                <div><p className={styles.eyebrow}>Headlight lab</p><h1 className={`${styles.title} serif`}>Tune the look</h1></div>
              </m.header>
              <m.section variants={item}><Reminders say={say} travel={travel} onTravel={setTravel}/></m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Layout and font</h2></div>
                  <SegmentedControl label="Today layout" value={layout} onChange={changeLayout} options={LAYOUTS}/>
                  <p className={styles.hint}>{layout === "focus" ? "One screen, no scrolling. Start sits by your thumb." : layout === "card" ? "One glass card, like a phone widget." : layout === "bento" ? "Small tiles: week, today, break, finish time." : "The sky stays open; everything sits on one sheet."}</p>
                  <Row label="Font" hint={font === "modern" ? "Plus Jakarta Sans: warm and premium" : font === "clean" ? "Inter Tight: crisp, like iOS" : font === "character" ? "Bricolage: bold, with personality" : "Fraunces: serif titles, magazine feel"}><SegmentedControl label="Font" value={font} onChange={changeFont} options={FONTS}/></Row>
                  <Button variant="glass" size="small" onClick={() => changeTab("today")}>See it on Today</Button>
                </Glass>
              </m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Wallpaper</h2><span className={styles.cardMeta}>Warms up on shift</span></div>
                  <Row label="Follow the time of day" hint={choice === "auto" ? `Now: ${scene.name}` : "Dawn, day, dusk and night"}><Toggle label="Follow the time of day" checked={choice === "auto"} onChange={on => changeScene(on ? "auto" : sceneId)}/></Row>
                  <div className={styles.picker} role="radiogroup" aria-label="Wallpaper">
                    {SCENES.map(option => {
                      const selected = choice === option.id;
                      return <m.button key={option.id} type="button" role="radio" aria-checked={selected} className={styles.pick} onClick={() => changeScene(option.id)} whileTap={{ scale: 0.95 }} transition={spring.tap}>
                        <span className={styles.thumb}><Wallpaper thumb scene={option.id} state="idle"/></span>
                        {selected && <m.span layoutId="wallpaper-ring" className={styles.ring} transition={spring.snappy}><Check aria-hidden="true"/></m.span>}
                        <span className={styles.pickName}>{option.name}</span>
                      </m.button>;
                    })}
                  </div>
                </Glass>
              </m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <Row label="Number weight" hint="Check 200 outside in daylight"><SegmentedControl label="Number weight" value={weight} onChange={setWeight} options={[{ value: "200", label: "200" }, { value: "300", label: "300" }]}/></Row>
                  <Row label="Live blur" hint="Off saves battery"><Toggle label="Live blur" checked={blur} onChange={setBlur}/></Row>
                  <Row label="Reduce motion" hint="How it feels turned down"><Toggle label="Reduce motion" checked={reduce} onChange={setReduce}/></Row>
                  <Row label="Haptics" hint="A tick on Start, Finish and Send"><Toggle label="Haptics" checked={haptics} onChange={setHapticsOn}/></Row>
                </Glass>
              </m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Messages</h2></div>
                  <p className={styles.hint}>Show one, then replace it while it&apos;s up. It reshapes instead of stacking. Swipe it away.</p>
                  <div className={styles.inline}>
                    <Button variant="glass" size="small" onClick={() => say("Backup saved on this phone")}>Show a message</Button>
                    <Button variant="glass" size="small" onClick={() => say("Shift deleted", { label: "Undo", onClick: () => say("Shift restored") })}>Replace it</Button>
                  </div>
                </Glass>
              </m.section>
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>The six springs</h2></div>
                  <p className={styles.hint}>Every movement uses one of these. Tap a row to feel it.</p>
                  <div className={styles.springs}>{(Object.keys(springSpec) as SpringName[]).map(name => <SpringRow key={name} name={name}/>)}</div>
                </Glass>
              </m.section>
              <m.footer variants={item} className={styles.footer}>
                <p className="serif">How does it feel now?</p>
                <p>Rate it 1 to 10 again, and tell me which wallpaper you kept.</p>
              </m.footer>
            </>}
          </m.main>}
        </AnimatePresence>
        </div>

        <TabBar value={tab} onChange={changeTab} tabs={[{ id: "today", label: "Today", icon: <Sun/> }, { id: "week", label: "Week", icon: <CalendarDays/> }, { id: "lab", label: "Lab", icon: <FlaskConical/> }]}/>

        <Sheet open={!!editing} onClose={() => setEditing(null)} title={sheetShift?.id === -1 ? "Add a past shift" : `${sheetShift?.day ?? ""}'s shift`} footer={<>
          {sheetShift?.id !== -1 && <Button variant="danger" icon={<Trash2/>} onClick={() => { const gone = editing; setEditing(null); if (gone) { setRecent(list => list.filter(s => s.id !== gone.id)); say("Shift deleted", { label: "Undo", onClick: () => { setRecent(list => [...list, gone].sort((a, b) => b.id - a.id)); say("Shift restored"); } }); } }}>Delete</Button>}
          <Button variant="primary" onClick={() => { setEditing(null); say(sheetShift?.id === -1 ? "Shift added" : "Shift updated"); }}>Save</Button>
        </>}>
          <div className={styles.form}>
            <label className={styles.field}><span>Started</span><input type="time" defaultValue={sheetShift?.start.slice(-5) ?? "06:00"}/></label>
            <label className={styles.field}><span>Finished</span><input type="time" defaultValue={sheetShift?.end.slice(-5) ?? "14:00"}/></label>
            <label className={`${styles.field} ${styles.wide}`}><span>Note</span><textarea rows={3} defaultValue={sheetShift?.note ?? ""} placeholder="Route, bus, anything worth remembering"/></label>
          </div>
        </Sheet>
        <Toast message={toast} onDismiss={() => setToast(null)}/>
      </div>
    </MotionConfig>
  </LazyMotion>;
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <div className={styles.row}><div><p>{label}</p><p className={styles.small}>{hint}</p></div>{children}</div>;
}

function SpringRow({ name }: { name: SpringName }) {
  const track = useRef<HTMLSpanElement>(null);
  const [x, setX] = useState(0);
  const spec = springSpec[name];
  return <button type="button" className={styles.springRow} onClick={() => { const width = track.current?.clientWidth ?? 0; setX(current => current ? 0 : Math.max(0, width - 18)); }}>
    <span className={styles.springText}>
      <span className={styles.springName}>{name}</span>
      <span className={`${styles.small} numeric`}>{spec.duration.toFixed(2)} s{spec.bounce ? ` · bounce ${spec.bounce}` : ""}</span>
    </span>
    <span ref={track} className={styles.springTrack}><m.span className={styles.springDot} animate={{ x }} transition={spring[name]}/></span>
  </button>;
}
