"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Bus, ChevronRight, Clock, Coffee, Flag, Footprints, NotebookPen, Play, Plus, Settings2, Square, TriangleAlert, X } from "lucide-react";
import { timeInZone } from "@/lib/ledger";
import { useNow } from "../features/use-now";
import Button from "../ui/button";
import Glass from "../ui/glass";
import MicPill, { type MicState } from "../ui/mic-pill";
import RollingNumber from "../ui/rolling-number";
import RouteLine from "../ui/route-line";
import WeekBars, { type DayBar } from "../ui/week-bars";
import { fade, spring } from "../ui/motion";
import { item } from "../lab/stagger";
import { AUTO_FINISH_AFTER, BREAK_AFTER, drivenSinceRest, hm, inPart, hms, kr, minutesToClock, nextPart, toMinutes, usualEnd, zoneMinutes, type DayPart } from "./usual";
import type { RunControls } from "./run";
import styles from "./home.module.css";

export type RecentItem = { id: string; day: string; start: string; end: string; minutes: number; note?: string };
type Alert = { id: string; text: string; icon?: ReactNode; action?: { label: string; onClick: () => void }; alt?: { label: string; onClick: () => void } };

/** Today: the week (or the running shift) as one glass card, the big button under it, recent shifts below. */
export default function Today(props: {
  run: RunControls; zone: string; parts: DayPart[]; rate: number; goalMinutes: number; dateLabel: string;
  weekMinutes: number; todayMinutes: number; weekDays: DayBar[]; recent: RecentItem[]; dayOff: boolean; travel: number;
  mic: MicState; level: number; micSeconds: number; onMic: () => void; defaults: boolean;
  onAddPast: () => void; onOpenShift: (id: string) => void; onNotes: () => void; onSettings: () => void; noteCount: number;
}) {
  const { run, zone, parts, rate, weekMinutes, todayMinutes, recent } = props;
  const { phase, breaks, startedAt, endedAt } = run;
  const running = phase === "running";
  const idle = phase === "idle";
  const clockTime = (ms: number) => timeInZone(ms, zone);
  const now = useNow(1000, running);
  // The clock ticks once a second, so a tap can be newer than the last tick: never count backwards.
  const end = phase === "landing" ? endedAt : Math.max(now, startedAt, ...breaks.map(b => Math.max(b.start, b.end ?? 0)));
  const onBreak = run.onBreak;
  const breakMs = breaks.reduce((sum, b) => sum + ((b.end ?? end) - b.start), 0);
  const elapsed = end - startedAt - breakMs;
  const currentBreak = breaks.find(b => !b.end);
  const dueIn = BREAK_AFTER - drivenSinceRest(startedAt, breaks, end);
  // By id; a run saved before ids were kept falls back to the name.
  const part = parts.find(p => run.partId ? p.id === run.partId : p.label === run.label);
  const usualEndAt = part ? usualEnd(startedAt, part, zone) : 0;
  const usualMinutes = part?.minutes ?? 450;
  const expectedEnd = startedAt + usualMinutes * 60000 + breakMs;
  const clock = useNow(60_000);
  const clockNow = zoneMinutes(running ? now : clock, zone);
  const upcoming = nextPart(parts, zoneMinutes(clock, zone));
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [blooms, setBlooms] = useState<number[]>([]);
  const goal = props.goalMinutes;
  const left = Math.max(0, goal - weekMinutes);
  const hour = Math.floor(clockNow / 60);
  const greeting = onBreak ? "On a break" : running ? "On the road" : hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const [pulse, setPulse] = useState(0);
  const lastWeek = useRef(weekMinutes);
  useEffect(() => { if (weekMinutes > lastWeek.current) setPulse(p => p + 1); lastWeek.current = weekMinutes; }, [weekMinutes]);

  function press() {
    setBlooms(list => [...list, Date.now()]);
    if (phase === "landing") return;
    if (running) run.finish(); else run.start(upcoming && inPart(upcoming, clockNow, 45) ? upcoming : undefined);
  }

  const eyebrowText = onBreak ? "On break" : idle ? "This week" : phase === "landing" ? "Shift done" : "On shift";
  const metaText = idle ? `≈ ${kr(weekMinutes, rate)} before tax` : phase === "landing" ? `≈ ${kr(elapsed / 60000, rate)} earned` : `≈ ${kr(elapsed / 60000, rate)} so far`;
  const swap = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6, transition: fade }, transition: spring.snappy };
  const eyebrow = <AnimatePresence mode="popLayout" initial={false}><m.p key={eyebrowText} className={styles.eyebrow} {...swap}>{eyebrowText}</m.p></AnimatePresence>;
  const timer = onBreak && currentBreak ? hms(end - currentBreak.start) : hms(elapsed);
  const bigNumber = <m.div key={pulse} className={styles.heroNumber} initial={pulse ? { scale: 1.06 } : false} animate={{ scale: 1 }} transition={spring.reward}>
    <RollingNumber value={idle ? hm(weekMinutes) : timer.slice(0, -3)} className={`${styles.big} ${!idle ? styles.bigTimer : ""} ${onBreak ? styles.paused : ""}`} label={idle ? `${hm(weekMinutes)} worked this week` : onBreak ? `On break for ${timer}` : `Shift time ${hms(elapsed)}`}/>
    {/* The seconds just tick: a roll every second would keep the card above redrawing its blur all shift long. */}
    {!idle && <span className={`${styles.secs} ${onBreak ? styles.paused : ""} numeric`} aria-hidden="true">:{timer.slice(-2)}</span>}
    <AnimatePresence initial={false}>{idle && goal > 0 && <m.span key="of" className={`${styles.of} numeric`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: fade }} transition={spring.smooth}>/ {Math.round(goal / 6) / 10} h</m.span>}</AnimatePresence>
  </m.div>;
  const shiftsThisWeek = props.weekDays.filter(d => d.minutes > 0).length;
  const under = <AnimatePresence mode="popLayout" initial={false}>
    <m.p key={idle ? "g" : onBreak ? "pb" : "since"} className={styles.under} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade}>
      {idle ? (goal > 0 ? (left === 0 ? "Goal reached. The rest is extra." : <><span className="numeric">{hm(left)}</span> to your goal</>) : <><span className="numeric">{shiftsThisWeek}</span> {shiftsThisWeek === 1 ? "day" : "days"} worked this week</>)
        : onBreak ? <>Shift paused at <span className="numeric">{hms(elapsed)}</span>. Take your time.</>
        : <>Usually done around <span className="numeric">{clockTime(expectedEnd)}</span></>}
    </m.p>
  </AnimatePresence>;
  const breakDueAt = onBreak ? null : end + dueIn * 60000;
  const shiftLine = <RouteLine startedAt={startedAt} now={end} breaks={breaks} usualMinutes={usualMinutes} breakDueAt={breakDueAt !== null && breakDueAt < expectedEnd ? breakDueAt : null} paused={onBreak} startLabel={clockTime(startedAt)} endLabel={`~${clockTime(expectedEnd)}`} arrived={phase === "landing"}/>;
  const due = !onBreak && dueIn <= 0;
  const liveStats = <div className={styles.liveStats}>
    <div className={`${styles.liveStat} ${due ? styles.liveHot : ""}`}>
      <span className={styles.liveLabel}><Coffee aria-hidden="true"/>{onBreak ? "On break" : due ? "Break due" : "Break in"}</span>
      {due ? <span className={styles.liveValue}>Now</span> : <RollingNumber className={styles.liveValue} value={onBreak && currentBreak ? hm((end - currentBreak.start) / 60000) : hm(Math.max(0, dueIn))}/>}
    </div>
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

  // "Something's off" checks: one calm card at a time, each with the fix one tap away.
  const weekday = new Date(clock).getDay() % 6 !== 0;
  const alerts: Alert[] = [];
  const startClock = zoneMinutes(startedAt, zone);
  const startPart = part ?? parts.find(p => inPart(p, startClock));
  // Minutes after the usual start, counted across midnight (23:50 start, tapped 00:10: 20).
  const lateBy = startPart ? ((startClock - toMinutes(startPart.start)) % 1440 + 1440) % 1440 : 0;
  if (running && !onBreak && startPart && !run.pieces.length && lateBy >= 10 && lateBy <= 180) {
    const at = Math.floor(startedAt / 60000) * 60000 - lateBy * 60000, label = startPart.start;
    alerts.push({ id: `start-${startedAt}`, text: `Started at ${label}? You tapped Start at ${clockTime(startedAt)}.`, icon: <Clock/>, action: { label: `Use ${label}`, onClick: () => run.backdate(at, label) } });
  }
  if (running && elapsed > 10 * 3600000) alerts.push({ id: `long-${startedAt}`, text: "This shift has run over 10 hours. Forgot to finish?", action: { label: "Finish", onClick: () => run.finish() } });
  else if (running && !onBreak && part && !run.stillDriving && usualEndAt && now > usualEndAt + 30 * 60000) alerts.push({ id: `late-${startedAt}`, text: `Past ${part.end}. Still driving? It stops by itself at ${minutesToClock(toMinutes(part.end) + AUTO_FINISH_AFTER)}.`, action: { label: "Finish", onClick: () => run.finish() }, alt: { label: "Still driving", onClick: run.keepDriving } });
  const leaveFrom = upcoming && props.travel ? toMinutes(upcoming.start) - props.travel : null;
  if (idle && weekday && !props.dayOff && upcoming && leaveFrom !== null && clockNow >= leaveFrom && clockNow < toMinutes(upcoming.start)) alerts.push({ id: `leave-${upcoming.id}`, text: `Time to leave. ${upcoming.label} shift at ${upcoming.start}.`, icon: <Footprints/> });
  if (idle && weekday && !props.dayOff && todayMinutes === 0 && parts.length && clockNow >= toMinutes(parts.at(-1)!.start) + parts.at(-1)!.minutes + 45) alerts.push({ id: "empty", text: "Nothing logged today. Was it your usual day?", action: { label: "Log it", onClick: () => run.logUsualDay() } });
  if (idle && props.defaults) alerts.push({ id: "defaults", text: "Your usual shifts still have the starter times. Set yours?", icon: <Bus/>, action: { label: "Set them", onClick: props.onSettings } });
  const alert = alerts.find(a => !dismissed.includes(a.id)) ?? null;

  const alertCard = <AnimatePresence initial={false} mode="popLayout">
    {alert && <m.section key={alert.id} className={styles.alert} role="status" initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: spring.exit }} transition={spring.settle}>
      <span className={styles.alertIcon} aria-hidden="true">{alert.icon ?? <TriangleAlert/>}</span>
      <p className={styles.alertText}>{alert.text}</p>
      {alert.alt && <button type="button" className={styles.alertAlt} onClick={() => { setDismissed(list => [...list, alert.id]); alert.alt?.onClick(); }}>{alert.alt.label}</button>}
      {alert.action && <Button variant="glass" size="small" onClick={() => { setDismissed(list => [...list, alert.id]); alert.action?.onClick(); }}>{alert.action.label}</Button>}
      {!alert.alt && <button type="button" className={styles.alertClose} aria-label="Dismiss" onClick={() => setDismissed(list => [...list, alert.id])}><X aria-hidden="true"/></button>}
    </m.section>}
  </AnimatePresence>;

  const header = <m.header variants={item} className={styles.top}>
    <div>
      <p className={styles.eyebrow}>{props.dateLabel}</p>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.h1 key={greeting} className={`${styles.title} serif`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: fade }} transition={spring.smooth}>{greeting}</m.h1>
      </AnimatePresence>
    </div>
    <m.button type="button" className={styles.roundButton} aria-label="Settings" onClick={props.onSettings} whileTap={{ scale: 0.92 }} transition={spring.tap}><Settings2/></m.button>
  </m.header>;

  const pop = { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9, transition: fade }, transition: spring.snappy };
  const mainButton = <div className={`${styles.mainWrap} ${running && !onBreak ? styles.breathing : ""}`}>
    <Button variant="primary" size="main" className={styles.mainButton} onClick={press}
      icon={<AnimatePresence mode="popLayout" initial={false}><m.span key={String(running)} initial={{ scale: 0.5, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.5, opacity: 0, transition: fade }} transition={spring.settle} style={{ display: "inline-flex" }}>{running ? <Square fill="currentColor"/> : <Play fill="currentColor"/>}</m.span></AnimatePresence>}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span key={String(running)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12, transition: fade }} transition={spring.snappy}>{running ? "Finish shift" : "Start shift"}</m.span>
      </AnimatePresence>
    </Button>
    {blooms.map(id => <m.span key={id} className={styles.bloom} initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.75, ease: [0.2, 0, 0, 1] }} onAnimationComplete={() => setBlooms(list => list.filter(b => b !== id))} aria-hidden="true"/>)}
  </div>;
  const quickSlot = <div className={styles.belowSlot}>
    <div className={`${styles.slotItem} ${styles.chips}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {running
          ? <Button key="break" {...pop} variant="glass" size="small" icon={onBreak ? <Play/> : <Coffee/>} onClick={run.toggleBreak}>{onBreak ? "Resume" : "Break"}</Button>
          : <Button key="usual" {...pop} variant="glass" size="small" icon={<Bus/>} onClick={() => upcoming ? run.start(upcoming) : run.logUsualDay()} aria-label={upcoming ? `Start your ${upcoming.label.toLowerCase()} shift` : "Log your usual day"}>{upcoming ? <>{upcoming.label} <span className="numeric">{upcoming.start}</span></> : "Usual day"}</Button>}
      </AnimatePresence>
      <MicPill state={props.mic} level={props.level} seconds={props.micSeconds} onToggle={props.onMic}/>
      <AnimatePresence mode="popLayout" initial={false}>
        {running
          ? <m.button key="notes" type="button" className={styles.roundButton} aria-label={props.noteCount ? `Notes (${props.noteCount})` : "Add a note"} onClick={props.onNotes} {...pop} whileTap={{ scale: 0.92 }}><NotebookPen/>{props.noteCount > 0 && <span className={styles.badge}>{props.noteCount}</span>}</m.button>
          : <m.button key="past" type="button" className={styles.roundButton} aria-label="Add a past shift" onClick={props.onAddPast} {...pop} whileTap={{ scale: 0.92 }}><Plus/></m.button>}
      </AnimatePresence>
    </div>
  </div>;

  // When a notice appears or leaves above them, the cards slide to their new place (transform only,
  // so their blur stays on) instead of jumping. They only measure themselves when the notice changes.
  const slide = { layout: "position" as const, layoutDependency: alert?.id ?? "", transition: { layout: spring.smooth } };
  return <div className={styles.screen}>
    {header}
    {alertCard}
    <m.section variants={item} {...slide}><Glass blur className={`${styles.heroCard} ${running ? styles.heroLive : ""}`}>
      <div className={styles.heroHead}>{eyebrow}<span className={`${styles.heroMeta} numeric`}>{metaText}</span></div>
      {bigNumber}{under}{visual}
    </Glass></m.section>
    <m.div variants={item} {...slide} className={styles.actions}>{mainButton}{quickSlot}</m.div>
    <m.section variants={item} {...slide}><Glass blur className={styles.card}>
      <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Recent shifts</h2><span className={styles.cardMeta}>{recent.length ? "Tap to edit" : ""}</span></div>
      {recent.length === 0 ? <p className={styles.hint}>Your shifts show up here. Tap Start when you pull out, or + to add one you forgot.</p> : <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {recent.map(shift => <m.li key={shift.id} initial={{ opacity: 0, height: 0, scale: 0.96 }} animate={{ opacity: 1, height: "auto", scale: 1 }} exit={{ opacity: 0, height: 0, transition: spring.exit }} transition={spring.settle}>
            <m.button type="button" className={styles.shiftRow} onClick={() => props.onOpenShift(shift.id)} whileTap={{ scale: 0.98 }} transition={spring.tap} aria-label={`Edit ${shift.day}'s shift, ${shift.start} to ${shift.end}`}>
              <span className={styles.rowDay}>{shift.day}<small className="numeric">{shift.start} – {shift.end}{shift.note ? ` · ${shift.note}` : ""}</small></span>
              <span className={`${styles.rowValue} numeric`}>{hm(shift.minutes)}</span>
              <ChevronRight className={styles.chev} aria-hidden="true"/>
            </m.button>
          </m.li>)}
        </AnimatePresence>
      </ul>}
    </Glass></m.section>
  </div>;
}
