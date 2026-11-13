"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Bus, ChevronRight, Coffee, FastForward, Play, Plus, Settings2, Square } from "lucide-react";
import { useNow } from "../features/use-now";
import Button from "../ui/button";
import Glass from "../ui/glass";
import MicPill, { type MicState } from "../ui/mic-pill";
import RollingNumber from "../ui/rolling-number";
import SavedCard from "../ui/saved-card";
import ShiftLine, { type Break } from "../ui/shift-line";
import WeekBars, { type DayBar } from "../ui/week-bars";
import { fade, spring } from "../ui/motion";
import { item } from "./stagger";
import styles from "./lab.module.css";

export type Phase = "idle" | "running" | "landing";
export type RecentShift = { id: number; day: string; start: string; end: string; minutes: number; note?: string };

export function hm(minutes: number) { return `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`; }
export function hms(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
export function clockTime(ms: number) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(ms); }

const GOAL_MINUTES = 37 * 60;
/** EU driving rules: a 45-minute break is due after 4 h 30 min of driving. */
const BREAK_AFTER = 270;
export const USUAL = { minutes: 450, label: "Route 2A", start: "06:00" };

/** The Today screen as Headlight would draw it, wired to the lab's pretend data. */
export default function Today(props: {
  phase: Phase; startedAt: number; endedAt: number; weekMinutes: number; todayMinutes: number; chipPulse: number; dateLabel: string;
  saved: string | null; note?: string; recent: RecentShift[]; mic: MicState; level: number; micSeconds: number; breaks: Break[]; weekDays: DayBar[];
  onBreak: () => void; onStartUsual: () => void; onUndo: () => void; onStart: () => void; onFinish: () => void; onFastForward: () => void; onMic: () => void; onAddPast: () => void; onOpenShift: (shift: RecentShift) => void; onSettings: () => void;
}) {
  const { phase, startedAt, endedAt, weekMinutes, todayMinutes, chipPulse, dateLabel, saved, recent } = props;
  const { breaks } = props;
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
  const expectedEnd = startedAt + USUAL.minutes * 60000 + breakMs;
  const number = useRef<HTMLDivElement>(null);
  const [blooms, setBlooms] = useState<number[]>([]);
  const shifts = recent.filter(r => r.day !== "Last week").length;

  const left = Math.max(0, GOAL_MINUTES - weekMinutes);
  const hour = new Date().getHours();
  const greeting = onBreak ? "On a break" : running ? "On the road" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  function press() {
    setBlooms(list => [...list, Date.now()]);
    if (phase === "landing") return;
    if (running) props.onFinish(); else props.onStart();
  }

  return <div className={styles.screen}>
    <m.header variants={item} className={styles.top}>
      <div>
        <p className={styles.eyebrow}>{dateLabel}</p>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.h1 key={greeting} className={`${styles.title} serif`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: fade }} transition={spring.smooth}>{greeting}</m.h1>
        </AnimatePresence>
      </div>
      <m.button type="button" className={styles.roundButton} aria-label="Settings" onClick={props.onSettings} whileTap={{ scale: 0.92 }} transition={spring.tap}><Settings2/></m.button>
    </m.header>

    <m.section variants={item}>
      <Glass blur className={`${styles.heroCard} ${running ? styles.heroLive : ""}`}>
        <div className={styles.heroHead}>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.p key={onBreak ? "b" : phase === "idle" ? "w" : "s"} className={styles.eyebrow} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: fade }} transition={spring.snappy}>{onBreak ? "On break" : phase === "idle" ? "This week" : "On shift"}</m.p>
          </AnimatePresence>
          <span className={`${styles.heroMeta} numeric`}>{phase === "idle" ? `${shifts} shifts · ${hm(todayMinutes)} today` : props.note ?? `Since ${clockTime(startedAt)}`}</span>
        </div>
        <m.div ref={number} key={chipPulse} className={styles.heroNumber} initial={chipPulse ? { scale: 1.06 } : false} animate={{ scale: 1 }} transition={spring.reward}>
          <RollingNumber value={phase === "idle" ? hm(weekMinutes) : onBreak && currentBreak ? hms(end - currentBreak.start) : hms(elapsed)} className={`${styles.big} ${phase !== "idle" ? styles.bigTimer : ""} ${onBreak ? styles.paused : ""}`} label={phase === "idle" ? `${hm(weekMinutes)} worked this week` : `Shift time ${hms(elapsed)}`}/>
          <AnimatePresence initial={false}>{phase === "idle" && <m.span key="of" className={`${styles.of} numeric`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: fade }} transition={spring.smooth}>/ 37 h</m.span>}</AnimatePresence>
        </m.div>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.p key={phase === "idle" ? "g" : onBreak ? "pb" : "since"} className={styles.under} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade}>
            {phase === "idle" ? (left === 0 ? "Goal reached. The rest is extra." : <><span className="numeric">{hm(left)}</span> to go · about {Math.max(1, Math.round(left / 450))} more shifts</>)
              : onBreak ? <>Shift paused at <span className="numeric">{hms(elapsed)}</span>. Take your time.</>
              : <>Usually done around <span className="numeric">{clockTime(expectedEnd)}</span></>}
          </m.p>
        </AnimatePresence>
        <div className={styles.heroVisual}>
          <AnimatePresence mode="popLayout" initial={false}>
            {phase === "idle"
              ? <m.div key="bars" className={styles.visualItem} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: spring.exit }} transition={spring.settle}><WeekBars days={props.weekDays}/></m.div>
              : <m.div key="line" className={styles.visualItem} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: spring.exit }} transition={spring.settle}>
                <ShiftLine startedAt={startedAt} now={end} breaks={breaks} usualMinutes={USUAL.minutes} startLabel={clockTime(startedAt)} endLabel={`~${clockTime(expectedEnd)}`}/>
                <m.div layout className={`${styles.breakChip} ${dueIn <= 0 && !onBreak ? styles.breakDue : ""}`} transition={spring.snappy}>
                  <Coffee aria-hidden="true"/>
                  <span className="numeric">{onBreak ? "Break counts toward your 45 min" : dueIn <= 0 ? "45 min break due now" : `45 min break due in ${hm(dueIn)}`}</span>
                </m.div>
              </m.div>}
          </AnimatePresence>
        </div>
      </Glass>
    </m.section>

    <m.div variants={item} className={styles.actions}>
      <div className={`${styles.mainWrap} ${running ? styles.breathing : ""}`}>
        <Button variant="primary" size="main" className={styles.mainButton} onClick={press}
          icon={<AnimatePresence mode="popLayout" initial={false}><m.span key={String(running)} initial={{ scale: 0.5, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.5, opacity: 0, transition: fade }} transition={spring.settle} style={{ display: "inline-flex" }}>{running ? <Square fill="currentColor"/> : <Play fill="currentColor"/>}</m.span></AnimatePresence>}>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span key={String(running)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12, transition: fade }} transition={spring.snappy}>{running ? "Finish shift" : "Start shift"}</m.span>
          </AnimatePresence>
        </Button>
        {blooms.map(id => <m.span key={id} className={styles.bloom} initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.75, ease: [0.2, 0, 0, 1] }} onAnimationComplete={() => setBlooms(list => list.filter(b => b !== id))} aria-hidden="true"/>)}
      </div>
      <div className={styles.belowSlot}>
        <AnimatePresence mode="popLayout" initial={false}>
          {saved && phase === "idle"
            ? <m.div key="saved" className={styles.slotItem} initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: spring.exit }} transition={spring.settle}><SavedCard shown detail={saved} onUndo={props.onUndo}/></m.div>
            : <m.div key="chips" className={`${styles.slotItem} ${styles.chips}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: spring.exit }} transition={spring.settle}>
              <AnimatePresence mode="popLayout" initial={false}>
                {running
                  ? <m.div key="note" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: fade }} transition={spring.snappy}><Button variant="glass" size="small" icon={onBreak ? <Play/> : <Coffee/>} onClick={props.onBreak}>{onBreak ? "Resume" : "Break"}</Button></m.div>
                  : <m.div key="usual" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: fade }} transition={spring.snappy}><Button variant="glass" size="small" icon={<Bus/>} onClick={props.onStartUsual} aria-label={`Start your usual ${USUAL.label} shift`}>{USUAL.label}</Button></m.div>}
              </AnimatePresence>
              <MicPill state={props.mic} level={props.level} seconds={props.micSeconds} onToggle={props.onMic}/>
              <AnimatePresence mode="popLayout" initial={false}>
                {running
                  ? <m.div key="ff" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: fade }} transition={spring.snappy}><Button variant="glass" size="small" icon={<FastForward/>} onClick={props.onFastForward} aria-label="Lab: jump 1 hour">+1 h</Button></m.div>
                  : <m.div key="past" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: fade }} transition={spring.snappy}><Button variant="glass" size="small" icon={<Plus/>} onClick={props.onAddPast}>Past shift</Button></m.div>}
              </AnimatePresence>
            </m.div>}
        </AnimatePresence>
      </div>
    </m.div>

    <m.section variants={item}>
      <Glass blur className={styles.card}>
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
      </Glass>
    </m.section>

  </div>;
}

