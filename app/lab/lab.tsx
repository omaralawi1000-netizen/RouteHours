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
import Today, { clockTime, hm, USUAL, type Layout, type Phase, type RecentShift } from "./today";
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
const LAYOUT_KEY = "routehours:lab-layout";
const LAYOUTS: { value: Layout; label: string }[] = [{ value: "horizon", label: "Horizon" }, { value: "card", label: "Card" }, { value: "bento", label: "Tiles" }];
/** Auto wallpaper: dawn sea in the morning, desert by day, dusk hills in the evening, the fjord at night. */
function sceneForHour(hour: number): SceneId { return hour >= 5 && hour < 10 ? "ocean" : hour >= 10 && hour < 16 ? "desert" : hour >= 16 && hour < 21 ? "dusk" : "fjord"; }

export default function Lab() {
  const [choice, setChoice] = useState<SceneId | "auto">("auto");
  const [hourNow, setHourNow] = useState(-1);
  useEffect(() => { const update = () => setHourNow(new Date().getHours()); update(); const timer = window.setInterval(update, 60_000); return () => window.clearInterval(timer); }, []);
  const sceneId: SceneId = choice === "auto" ? (hourNow < 0 ? "dusk" : sceneForHour(hourNow)) : choice;
  const scene = SCENES.find(s => s.id === sceneId) ?? SCENES[0];
  const [layout, setLayout] = useState<Layout>("horizon");
  const look = scene.tone;
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SCENE_KEY); if (stored && (stored === "auto" || SCENES.some(s => s.id === stored))) setChoice(stored as SceneId | "auto");
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
  function changeTab(next: TabId) { setTab(next); window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); }

  const [breaks, setBreaks] = useState<Break[]>([]);
  const [note, setNote] = useState<string | undefined>();
  function start(withNote?: string) { tick(); setSaved(null); setBreaks([]); setNote(withNote); setStartedAt(Date.now()); setPhase("running"); }
  function startUsual() { start(USUAL.label); say(`${USUAL.label} started. Usually ${hm(USUAL.minutes)}.`); }
  function toggleBreak() {
    tick();
    const open = breaks.some(b => !b.end);
    setBreaks(list => open ? list.map(b => b.end ? b : { ...b, end: Date.now() }) : [...list, { start: Date.now() }]);
    if (open) say("Back on the road");
  }
  function finish() {
    tick();
    const end = Date.now(), breakMs = breaks.reduce((sum, b) => sum + ((b.end ?? end) - b.start), 0), id = end;
    const minutes = Math.max(1, Math.round((end - startedAt - breakMs) / 60000));
    setBreaks(list => list.map(b => b.end ? b : { ...b, end }));
    setEndedAt(end); setPhase("landing");
    later(420, () => { setWeekMinutes(total => total + minutes); setTodayMinutes(total => total + minutes); setChipPulse(p => p + 1); });
    later(1100, () => {
      setPhase("idle"); setSaved({ minutes, startedAt, id });
      setRecent(list => [{ id, day: "Today", start: clockTime(startedAt), end: clockTime(end), minutes, note }, ...list]);
    });
    later(8000, () => setSaved(current => current?.id === id ? null : current));
  }
  function undoFinish() {
    if (!saved) return;
    setWeekMinutes(total => total - saved.minutes); setTodayMinutes(total => total - saved.minutes);
    setRecent(list => list.filter(shift => shift.id !== saved.id));
    setStartedAt(saved.startedAt); setBreaks(list => list.map((b, i) => i === list.length - 1 && b.end === saved.id ? { start: b.start } : b)); setPhase("running"); setSaved(null);
    say("Shift resumed");
  }

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
      <div className={`look ${styles.lab}`} data-look={look} data-state={running ? "running" : "idle"} data-blur={blur ? "on" : "off"} data-motion={reduce ? "reduced" : "full"} style={{ ["--number-weight" as string]: weight }}>
        <Wallpaper scene={sceneId} state={running && !breaks.some(b => !b.end) ? "running" : "idle"}/>
        <AnimatePresence mode="wait" initial={true}>
          <m.main key={tab} className={styles.page} variants={screen} initial="hidden" animate="show" exit="leave">
            {tab === "today" && <Today phase={phase} startedAt={startedAt} endedAt={endedAt} weekMinutes={weekMinutes} todayMinutes={todayMinutes} chipPulse={chipPulse} dateLabel={dateLabel}
              saved={saved ? `${hm(saved.minutes)} added to this week` : null} recent={recent} mic={mic} level={level} micSeconds={micSeconds}
              layout={layout} note={note} breaks={breaks} weekDays={weekDays} onBreak={toggleBreak} onStartUsual={startUsual}
              onUndo={undoFinish} onStart={() => start()} onFinish={finish} onFastForward={() => { setStartedAt(value => value - 3_600_000); setBreaks(list => list.map(b => ({ start: b.start - 3_600_000, end: b.end && b.end - 3_600_000 }))); }} onMic={toggleMic}
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
              <m.section variants={item}>
                <Glass blur className={styles.card}>
                  <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Today layout</h2><span className={styles.cardMeta}>Three ideas</span></div>
                  <SegmentedControl label="Today layout" value={layout} onChange={changeLayout} options={LAYOUTS}/>
                  <p className={styles.hint}>{layout === "card" ? "One glass card, like a phone widget." : layout === "bento" ? "Small tiles: week, today, break, finish time." : "The sky stays open; everything sits on one sheet."}</p>
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
          </m.main>
        </AnimatePresence>

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
