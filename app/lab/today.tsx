"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Bus, ChevronRight, Footprints, Coffee, FastForward, Flag, Play, Plus, Settings2, Square, Sun, TriangleAlert, X } from "lucide-react";
import { useNow } from "../features/use-now";
import Button from "../ui/button";
import Glass from "../ui/glass";
import MicPill, { type MicState } from "../ui/mic-pill";
import RollingNumber from "../ui/rolling-number";
import RouteLine from "../ui/route-line";
import { type Break } from "../ui/shift-line";
import WeekBars, { type DayBar } from "../ui/week-bars";
import { fade, spring } from "../ui/motion";
import { item } from "./stagger";
import styles from "./lab.module.css";

export type Layout = "focus" | "card" | "bento" | "horizon";
export type Phase = "idle" | "running" | "landing";
export type RecentShift = { id: number; day: string; start: string; end: string; minutes: number; note?: string };

export function hm(minutes: number) { return `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`; }
export function hms(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
export function clockTime(ms: number) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(ms); }

const GOAL_MINUTES = 37 * 60;
/** EU driving rules: a 45-minute break is due after 4 h 30 min of driving. */
const BREAK_AFTER = 270;
/** Omar's hourly rate, for a before-tax pay estimate. Lab only for now. */
export const RATE = 180;
const krFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
export function kr(minutes: number) { return `${krFormat.format(Math.round(minutes / 60 * RATE))} kr`; }
export const USUAL = { minutes: 450, label: "Route 2A", start: "06:00" };
/** Omar's usual working day: a split shift. */
export type DayPart = { id: "morning" | "afternoon"; label: string; start: string; end: string; minutes: number };
export const DAY_PARTS: DayPart[] = [
  { id: "morning", label: "Morning", start: "06:45", end: "08:10", minutes: 85 },
  { id: "afternoon", label: "Afternoon", start: "12:25", end: "14:45", minutes: 140 },
];
const toMinutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const minutesToClock = (t: number) => `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
/** Minutes after a run's usual end before an unfinished shift finishes itself. */
export const AUTO_FINISH_AFTER = 60;
export function copenhagenMinutes(at = Date.now()) { const [h, m] = clockTime(at).split(":").map(Number); return h * 60 + m; }
/** The part of the usual day that comes next: Morning until 10:30, Afternoon until 14:00, then none. */
export function nextPart(at = Date.now()): DayPart | null {
  const now = copenhagenMinutes(at);
  return now < toMinutes("10:30") ? DAY_PARTS[0] : now < toMinutes("14:00") ? DAY_PARTS[1] : null;
}
export const usualDayMinutes = DAY_PARTS.reduce((sum, p) => sum + p.minutes, 0);
export type Alert = { id: string; text: string; icon?: ReactNode; action?: { label: string; onClick: () => void }; alt?: { label: string; onClick: () => void } };

/** The Today screen as Headlight would draw it, wired to the lab's pretend data. */
export default function Today(props: {
  phase: Phase; startedAt: number; endedAt: number; weekMinutes: number; todayMinutes: number; chipPulse: number; dateLabel: string;
  note?: string; layout: Layout; recent: RecentShift[]; mic: MicState; level: number; micSeconds: number; breaks: Break[]; weekDays: DayBar[];
  dayOff?: boolean; onLogUsualDay: () => void; stillDriving?: boolean; onStillDriving: () => void; onAutoFinish: (at: number) => void; travel?: number;
  onBreak: () => void; onStartUsual: () => void; onUndo: () => void; onStart: () => void; onFinish: () => void; onFastForward: () => void; onMic: () => void; onAddPast: () => void; onOpenShift: (shift: RecentShift) => void; onSettings: () => void;
}) {
  const { phase, startedAt, endedAt, weekMinutes, todayMinutes, chipPulse, dateLabel, recent } = props;
  const { breaks, layout } = props;
  const running = phase === "running";
  const now = useNow(1000, running);
  const end = phase === "landing" ? endedAt : now;
  const onBreak = running && breaks.some(b => !b.end);
  const breakMs = breaks.reduce((sum, b) => sum + ((b.end ?? end) - b.start), 0);
  const elapsed = end - startedAt - breakMs;
  const currentBreak = breaks.find(b => !b.end);
  const lastBreakEnd = breaks.filter(b => b.end && b.end - b.start >= 15 * 60000).reduce((last, b) => Math.max(last, b.end ?? 0), startedAt);
  const drivingSince = (end - lastBreakEnd) / 60000;
  const dueIn = BREAK_AFTER - drivingSince;
  const part = DAY_PARTS.find(p => p.label === props.note);
  const usualMinutes = part?.minutes ?? USUAL.minutes;
  const expectedEnd = startedAt + usualMinutes * 60000 + breakMs;
  const clock = useNow(60_000);
  // Time-of-day text waits for the phone's clock, so the page built on the server never disagrees with it.
  // The lab only draws its pages in the browser, so this is true from the first frame there.
  const [hydrated, setHydrated] = useState(() => typeof window !== "undefined");
  useEffect(() => setHydrated(true), []);
  const upcoming = hydrated ? nextPart(clock) : null;
  const [dismissed, setDismissed] = useState<string[]>([]);
  const number = useRef<HTMLDivElement>(null);
  const [blooms, setBlooms] = useState<number[]>([]);
  const shifts = recent.filter(r => r.day !== "Last week").length;
  // A new shift lands at the front of the strip: slide back to show it.
  const stripRef = useRef<HTMLDivElement>(null);
  const firstId = recent[0]?.id;
  useEffect(() => { stripRef.current?.scrollTo({ left: 0, behavior: "smooth" }); }, [firstId]);

  const left = Math.max(0, GOAL_MINUTES - weekMinutes);
  const hour = new Date().getHours();
  const greeting = onBreak ? "On a break" : running ? "On the road" : !hydrated ? "Hello" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  function press() {
    setBlooms(list => [...list, Date.now()]);
    if (phase === "landing") return;
    if (running) props.onFinish(); else props.onStart();
  }

  const idle = phase === "idle";
  const eyebrowText = onBreak ? "On break" : idle ? "This week" : "On shift";
  const metaText = idle ? `≈ ${kr(weekMinutes)} before tax` : `≈ ${kr(elapsed / 60000)} so far`;
  const swap = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6, transition: fade }, transition: spring.snappy };
  const eyebrow = <AnimatePresence mode="popLayout" initial={false}><m.p key={eyebrowText} className={styles.eyebrow} {...swap}>{eyebrowText}</m.p></AnimatePresence>;
  const timer = onBreak && currentBreak ? hms(end - currentBreak.start) : hms(elapsed);
  const bigNumber = <m.div ref={number} key={chipPulse} className={styles.heroNumber} initial={chipPulse ? { scale: 1.06 } : false} animate={{ scale: 1 }} transition={spring.reward}>
    <RollingNumber value={idle ? hm(weekMinutes) : timer.slice(0, -3)} className={`${styles.big} ${!idle ? styles.bigTimer : ""} ${onBreak ? styles.paused : ""}`} label={idle ? `${hm(weekMinutes)} worked this week` : `Shift time ${hms(elapsed)}`}/>
    {!idle && <RollingNumber value={timer.slice(-2)} className={`${styles.secs} ${onBreak ? styles.paused : ""}`} label=" "/>}
    <AnimatePresence initial={false}>{idle && <m.span key="of" className={`${styles.of} numeric`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: fade }} transition={spring.smooth}>/ 37 h</m.span>}</AnimatePresence>
  </m.div>;
  const under = <AnimatePresence mode="popLayout" initial={false}>
    <m.p key={idle ? "g" : onBreak ? "pb" : "since"} className={styles.under} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade}>
      {idle ? (left === 0 ? "Goal reached. The rest is extra." : <><span className="numeric">{hm(left)}</span> to go · about {Math.max(1, Math.round(left / 450))} more shifts</>)
        : onBreak ? <>Shift paused at <span className="numeric">{hms(elapsed)}</span>. Take your time.</>
        : <>Usually done around <span className="numeric">{clockTime(expectedEnd)}</span></>}
    </m.p>
  </AnimatePresence>;
  const breakDueAt = onBreak ? null : end + dueIn * 60000;
  const shiftLine = <RouteLine startedAt={startedAt} now={end} breaks={breaks} usualMinutes={usualMinutes} breakDueAt={breakDueAt !== null && breakDueAt < expectedEnd ? breakDueAt : null} paused={onBreak} startLabel={clockTime(startedAt)} endLabel={`~${clockTime(expectedEnd)}`}/>;
  const due = !onBreak && dueIn <= 0;
  const liveStats = <div className={styles.liveStats}>
    <m.div layout className={`${styles.liveStat} ${due ? styles.liveHot : ""}`} transition={spring.snappy}>
      <span className={styles.liveLabel}><Coffee aria-hidden="true"/>{onBreak ? "On break" : due ? "Break due" : "Break in"}</span>
      {due ? <span className={styles.liveValue}>Now</span> : <RollingNumber className={styles.liveValue} value={onBreak && currentBreak ? hm((end - currentBreak.start) / 60000) : hm(Math.max(0, dueIn))}/>}
    </m.div>
    <div className={styles.liveStat}>
      <span className={styles.liveLabel}><Flag aria-hidden="true"/>Done around</span>
      <RollingNumber className={styles.liveValue} value={clockTime(expectedEnd)}/>
    </div>
  </div>;
  const visual = <div className={styles.heroVisual}>
    <AnimatePresence mode="popLayout" initial={false}>
      {idle
        ? <m.div key="bars" className={`${styles.visualItem} ${styles.focusBars}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: spring.exit }} transition={spring.settle}><WeekBars tall days={props.weekDays}/></m.div>
        : <m.div key="line" className={styles.visualItem} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: spring.exit }} transition={spring.settle}>{shiftLine}{liveStats}</m.div>}
    </AnimatePresence>
  </div>;
  const heroInner = <>
    <div className={styles.heroHead}>{eyebrow}<span className={`${styles.heroMeta} numeric`}>{metaText}</span></div>
    {bigNumber}{under}{visual}
  </>;

  // "Something's off" checks: one calm card at a time, each with the fix one tap away.
  const clockNow = copenhagenMinutes(running ? now : clock);
  const weekday = new Date(clock).getDay() % 6 !== 0;
  const alerts: Alert[] = [];
  if (running && elapsed > 10 * 3600000) alerts.push({ id: "long", text: "This shift has run over 10 hours. Forgot to finish?", action: { label: "Finish", onClick: props.onFinish } });
  else if (running && !onBreak && part && !props.stillDriving && clockNow > toMinutes(part.end) + 30) alerts.push({ id: `late-${part.id}`, text: `Past ${part.end}. Still driving? It stops by itself at ${minutesToClock(toMinutes(part.end) + AUTO_FINISH_AFTER)}.`, action: { label: "Finish", onClick: props.onFinish }, alt: { label: "Still driving", onClick: props.onStillDriving } });
  const leaveFrom = upcoming && props.travel ? toMinutes(upcoming.start) - props.travel : null;
  if (idle && weekday && !props.dayOff && upcoming && leaveFrom !== null && clockNow >= leaveFrom && clockNow < toMinutes(upcoming.start)) alerts.push({ id: `leave-${upcoming.id}`, text: `Time to leave. ${upcoming.label} shift at ${upcoming.start}.`, icon: <Footprints/> });
  if (idle && weekday && !props.dayOff && todayMinutes === 0 && clockNow >= 15 * 60 + 30) alerts.push({ id: "empty", text: "Nothing logged today. Was it your usual day?", action: { label: "Log it", onClick: props.onLogUsualDay } });
  const alert = hydrated ? alerts.find(a => !dismissed.includes(a.id)) ?? null : null;

  // Auto-stop: a usual run nobody finished closes itself an hour after its usual end, logged as
  // ending at the usual time. "Still driving" (here or on the reminder) turns this off for the run.
  const usualEndAt = part ? Math.floor(now / 60000) * 60000 - (clockNow - toMinutes(part.end)) * 60000 : 0;
  const autoDue = hydrated && running && !onBreak && !!part && !props.stillDriving && clockNow >= toMinutes(part.end) + AUTO_FINISH_AFTER && usualEndAt > startedAt + 10 * 60000;
  const autoFired = useRef(0);
  useEffect(() => {
    if (!autoDue || autoFired.current === startedAt) return;
    autoFired.current = startedAt;
    props.onAutoFinish(usualEndAt);
  }, [autoDue, startedAt, usualEndAt, props]);
  const alertCard = <AnimatePresence initial={false} mode="popLayout">
    {alert && <m.section key={alert.id} layout className={styles.alert} role="status" initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: spring.exit }} transition={spring.settle}>
      <span className={styles.alertIcon} aria-hidden="true">{alert.icon ?? <TriangleAlert/>}</span>
      <p className={styles.alertText}>{alert.text}</p>
      {alert.alt && <button type="button" className={styles.alertAlt} onClick={() => { setDismissed(list => [...list, alert.id]); alert.alt?.onClick(); }}>{alert.alt.label}</button>}
      {alert.action && <Button variant="glass" size="small" onClick={() => { setDismissed(list => [...list, alert.id]); alert.action?.onClick(); }}>{alert.action.label}</Button>}
      {!alert.alt && <button type="button" className={styles.alertClose} aria-label="Dismiss" onClick={() => setDismissed(list => [...list, alert.id])}><X aria-hidden="true"/></button>}
    </m.section>}
  </AnimatePresence>;

  // Off shift only: while driving, the route is the job, not the trip to it.

  const header = <m.header variants={item} className={`${styles.top} ${layout === "horizon" ? styles.topTall : ""}`}>
    <div>
      <p className={styles.eyebrow}>{dateLabel}</p>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.h1 key={greeting} className={`${styles.title} serif`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: fade }} transition={spring.smooth}>{greeting}</m.h1>
      </AnimatePresence>
      {layout === "horizon" && <p className={styles.tagline}>{idle ? <>Week 46 · <span className="numeric">{shifts}</span> shifts so far</> : onBreak ? "The clock is paused." : `${props.note ?? "Shift"} · drive safe`}</p>}
    </div>
    <m.button type="button" className={styles.roundButton} aria-label="Settings" onClick={props.onSettings} whileTap={{ scale: 0.92 }} transition={spring.tap}><Settings2/></m.button>
  </m.header>;

  const pop = { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9, transition: fade }, transition: spring.snappy };
  const mainButton = <>
    <div className={`${styles.mainWrap} ${running ? styles.breathing : ""}`}>
      <Button variant="primary" size="main" className={styles.mainButton} onClick={press}
        icon={<AnimatePresence mode="popLayout" initial={false}><m.span key={String(running)} initial={{ scale: 0.5, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.5, opacity: 0, transition: fade }} transition={spring.settle} style={{ display: "inline-flex" }}>{running ? <Square fill="currentColor"/> : <Play fill="currentColor"/>}</m.span></AnimatePresence>}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span key={String(running)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12, transition: fade }} transition={spring.snappy}>{running ? "Finish shift" : "Start shift"}</m.span>
        </AnimatePresence>
      </Button>
      {blooms.map(id => <m.span key={id} className={styles.bloom} initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.75, ease: [0.2, 0, 0, 1] }} onAnimationComplete={() => setBlooms(list => list.filter(b => b !== id))} aria-hidden="true"/>)}
    </div>
  </>;
  const quickSlot = <>
    <div className={styles.belowSlot}>
      <div className={`${styles.slotItem} ${styles.chips}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              {running
                ? <m.div key="break" {...pop}><Button variant="glass" size="small" icon={onBreak ? <Play/> : <Coffee/>} onClick={props.onBreak}>{onBreak ? "Resume" : "Break"}</Button></m.div>
                : <m.div key="usual" {...pop}><Button variant="glass" size="small" icon={<Bus/>} onClick={props.onStartUsual} aria-label={upcoming ? `Start your ${upcoming.label.toLowerCase()} shift` : "Log your usual day"}>{upcoming ? <>{upcoming.label} <span className="numeric">{upcoming.start}</span></> : "Usual day"}</Button></m.div>}
            </AnimatePresence>
            <MicPill state={props.mic} level={props.level} seconds={props.micSeconds} onToggle={props.onMic}/>
            <AnimatePresence mode="popLayout" initial={false}>
              {running
                ? <m.button key="ff" type="button" className={styles.roundButton} aria-label="Lab: jump 1 hour" onClick={props.onFastForward} {...pop} whileTap={{ scale: 0.92 }}><FastForward/></m.button>
                : <m.button key="past" type="button" className={styles.roundButton} aria-label="Add a past shift" onClick={props.onAddPast} {...pop} whileTap={{ scale: 0.92 }}><Plus/></m.button>}
            </AnimatePresence>
      </div>
    </div>
  </>;
  const actions = <m.div variants={item} className={styles.actions}>{mainButton}{quickSlot}</m.div>;

  const recentInner = <>
    <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Recent shifts</h2><span className={styles.cardMeta}>Tap to edit</span></div>
    <ul className={styles.list}>
      <AnimatePresence initial={false}>
        {recent.slice(0, 4).map(shift => <m.li key={shift.id} layout initial={{ opacity: 0, height: 0, scale: 0.96 }} animate={{ opacity: 1, height: "auto", scale: 1 }} exit={{ opacity: 0, height: 0, transition: spring.exit }} transition={spring.settle}>
          <m.button type="button" className={styles.shiftRow} onClick={() => props.onOpenShift(shift)} whileTap={{ scale: 0.98 }} transition={spring.tap} aria-label={`Edit ${shift.day}'s shift`}>
            <span className={styles.rowDay}>{shift.day}<small className="numeric">{shift.start} – {shift.end}{shift.note ? ` · ${shift.note}` : ""}</small></span>
            <span className={`${styles.rowValue} numeric`}>{hm(shift.minutes)}</span>
            <ChevronRight className={styles.chev} aria-hidden="true"/>
          </m.button>
        </m.li>)}
      </AnimatePresence>
    </ul>
  </>;

  if (layout === "focus") return <div className={`${styles.screen} ${styles.focusScreen}`}>
    {header}
    {alertCard}
    <m.section variants={item} className={styles.focusMain}>
      <Glass blur className={`${styles.heroCard} ${styles.focusHero} ${running ? styles.heroLive : ""}`}>
        <div className={styles.heroHead}>{eyebrow}<span className={`${styles.payPill} numeric`}>{metaText}</span></div>
        {bigNumber}{under}
        <div className={`${styles.heroVisual} ${styles.focusVisual}`}>
          <AnimatePresence mode="popLayout" initial={false}>
            {idle
              ? <m.div key="bars" className={`${styles.visualItem} ${styles.focusBars}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: spring.exit }} transition={spring.settle}><WeekBars tall days={props.weekDays}/></m.div>
              : <m.div key="line" className={styles.visualItem} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: spring.exit }} transition={spring.settle}>{shiftLine}{liveStats}</m.div>}
          </AnimatePresence>
        </div>
      </Glass>
    </m.section>
    <m.section variants={item} className={styles.recentStrip}>
      <div className={styles.stripHead}><h2 className={`${styles.stripTitle} serif`}>Recent</h2><span className={styles.cardMeta}>Swipe · tap to edit</span></div>
      <div ref={stripRef} className={styles.strip}>
        <AnimatePresence initial={false} mode="popLayout">
          {recent.slice(0, 6).map(shift => <m.button key={shift.id} layout type="button" className={styles.shiftChip} onClick={() => props.onOpenShift(shift)} aria-label={`Edit ${shift.day}'s shift`}
            initial={{ opacity: 0, scale: 0.9, x: -20 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9, transition: spring.exit }} transition={spring.settle} whileTap={{ scale: 0.96 }}>
            <span className={styles.chipDay}>{shift.day}</span>
            <span className={`${styles.chipValue} numeric`}>{hm(shift.minutes)}</span>
            <span className={`${styles.chipTimes} numeric`}>{shift.start.slice(-5)} – {shift.end}</span>
          </m.button>)}
        </AnimatePresence>
      </div>
    </m.section>
    <div className={styles.dock}>
      <div className={styles.dockSlot}>{quickSlot}</div>
      {mainButton}
    </div>
  </div>;

  if (layout === "horizon") return <div className={styles.screen}>
    {header}
    {alertCard}
    <m.section variants={item} className={styles.horizonWrap}>
      <Glass blur className={`${styles.sheetPanel} ${running ? styles.heroLive : ""}`}>
        <span className={styles.grabber} aria-hidden="true"/>
        <div className={styles.sheetHero}>{heroInner}</div>
        {actions}
        <div className={styles.sheetRecent}>{recentInner}</div>
      </Glass>
    </m.section>
  </div>;

  if (layout === "bento") return <div className={styles.screen}>
    {header}
    {alertCard}
    <m.section variants={item} className={styles.bento}>
      <Glass blur className={`${styles.tile} ${styles.tileWide} ${running ? styles.heroLive : ""}`}>
        <div className={styles.heroHead}>{eyebrow}<span className={`${styles.heroMeta} numeric`}>{metaText}</span></div>
        {bigNumber}
        <AnimatePresence mode="popLayout" initial={false}>
          {idle
            ? <m.div key="goal" className={styles.goal} {...swap}>
              <div className={styles.goalTrack}><m.div className={styles.goalFill} initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, weekMinutes / GOAL_MINUTES) }} transition={{ ...spring.settle, delay: 0.2 }}/></div>
              <p className={`${styles.goalText} numeric`}><span>{Math.round(Math.min(1, weekMinutes / GOAL_MINUTES) * 100)}% of 37 h</span><span>{hm(left)} to go</span></p>
            </m.div>
            : <m.div key="line" className={styles.goal} {...swap}>{shiftLine}</m.div>}
        </AnimatePresence>
      </Glass>
      <Glass blur className={`${styles.tile} ${!idle && dueIn <= 0 && !onBreak ? styles.tileHot : ""}`}>
        <span className={styles.tileIcon} aria-hidden="true">{idle ? <Sun/> : <Coffee/>}</span>
        <p className={styles.tileLabel}>{idle ? "Today" : onBreak ? "On break" : dueIn <= 0 ? "Break due" : "Break in"}</p>
        {!idle && !onBreak && dueIn <= 0 ? <p className={styles.tileValue}>Now</p> : <RollingNumber className={styles.tileValue} value={idle ? hm(todayMinutes) : onBreak && currentBreak ? hm((end - currentBreak.start) / 60000) : hm(Math.max(0, dueIn))}/>}
        <p className={styles.tileSub}>{idle ? (todayMinutes ? "logged" : "nothing yet") : onBreak ? "of 45 min" : dueIn <= 0 ? "Pull in when safe" : "45 min rule"}</p>
      </Glass>
      <Glass blur className={styles.tile}>
        <span className={styles.tileIcon} aria-hidden="true">{idle ? <Bus/> : <Flag/>}</span>
        <p className={styles.tileLabel}>{idle ? "Usual shift" : "Done around"}</p>
        <RollingNumber className={styles.tileValue} value={idle ? USUAL.start : clockTime(expectedEnd)}/>
        <p className={styles.tileSub}>{idle ? `${USUAL.label} · ${hm(USUAL.minutes)}` : `${hm(USUAL.minutes)} usual`}</p>
      </Glass>
      <Glass blur className={`${styles.tile} ${styles.tileWide}`}>
        <div className={styles.heroHead}><p className={styles.eyebrow}>Your week</p><span className={`${styles.heroMeta} numeric`}>{shifts} shifts</span></div>
        <div className={styles.tileBars}><WeekBars days={props.weekDays}/></div>
      </Glass>
    </m.section>
    {actions}
    <m.section variants={item}><Glass blur className={styles.card}>{recentInner}</Glass></m.section>
  </div>;

  return <div className={styles.screen}>
    {header}
    {alertCard}
    <m.section variants={item}><Glass blur className={`${styles.heroCard} ${running ? styles.heroLive : ""}`}>{heroInner}</Glass></m.section>
    {actions}
    <m.section variants={item}><Glass blur className={styles.card}>{recentInner}</Glass></m.section>
  </div>;
}

