"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ChevronRight, FastForward, Play, Plus, Settings2, Square, StickyNote } from "lucide-react";
import { useNow } from "../features/use-now";
import ArcGauge from "../ui/arc-gauge";
import Button from "../ui/button";
import Glass from "../ui/glass";
import MicPill, { type MicState } from "../ui/mic-pill";
import RollingNumber from "../ui/rolling-number";
import SavedCard from "../ui/saved-card";
import { fade, spring } from "../ui/motion";
import { item } from "./stagger";
import styles from "./lab.module.css";

export type Phase = "idle" | "running" | "landing";
export type RecentShift = { id: number; day: string; start: string; end: string; minutes: number; note?: string };

export function hm(minutes: number) { return `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`; }
export function hms(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
export function clockTime(ms: number) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(ms); }

const GOAL_MINUTES = 37 * 60;

/** The Today screen as Headlight would draw it, wired to the lab's pretend data. */
export default function Today(props: {
  phase: Phase; startedAt: number; endedAt: number; weekMinutes: number; todayMinutes: number; chipPulse: number; dateLabel: string;
  saved: string | null; recent: RecentShift[]; mic: MicState; level: number; micSeconds: number;
  onUndo: () => void; onStart: () => void; onFinish: () => void; onFastForward: () => void; onMic: () => void; onNote: () => void; onAddPast: () => void; onOpenShift: (shift: RecentShift) => void; onSettings: () => void;
}) {
  const { phase, startedAt, endedAt, weekMinutes, todayMinutes, chipPulse, dateLabel, saved, recent } = props;
  const running = phase === "running";
  const now = useNow(1000, running);
  const elapsed = (phase === "landing" ? endedAt : now) - startedAt;
  const liveWeek = weekMinutes + (running ? elapsed / 60000 : 0);
  const screen = useRef<HTMLDivElement>(null), number = useRef<HTMLDivElement>(null), weekStat = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<{ x: number; y: number; toX: number; toY: number; text: string } | null>(null);
  const [blooms, setBlooms] = useState<number[]>([]);

  // When a shift finishes, its length lifts off the big number and flies into "This week".
  useLayoutEffect(() => {
    if (phase !== "landing") { setFlight(null); return; }
    const box = screen.current?.getBoundingClientRect(), from = number.current?.getBoundingClientRect(), to = weekStat.current?.getBoundingClientRect();
    if (!box || !from || !to) return;
    setFlight({ x: from.left + from.width / 2 - box.left, y: from.top + from.height / 2 - box.top, toX: to.left + to.width / 2 - box.left, toY: to.top + to.height / 2 - box.top, text: `+${hm(Math.round((endedAt - startedAt) / 60000))}` });
  }, [phase, endedAt, startedAt]);

  const left = Math.max(0, GOAL_MINUTES - weekMinutes);
  const insight = running ? "Drive safe. I'm keeping count." : saved ? "Nice shift. It's already in your week." : left === 0 ? "Goal reached. Everything from here is extra." : `${Math.round(left / 60)} hours to your goal. About ${Math.max(1, Math.round(left / 450))} more shifts.`;
  const hour = new Date().getHours();
  const greeting = running ? "On the road" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  function press() {
    setBlooms(list => [...list, Date.now()]);
    if (phase === "landing") return;
    if (running) props.onFinish(); else props.onStart();
  }

  return <div ref={screen} className={styles.screen}>
    <m.header variants={item} className={styles.top}>
      <div>
        <p className={styles.eyebrow}>{dateLabel}</p>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.h1 key={greeting} className={`${styles.title} serif`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: fade }} transition={spring.smooth}>{greeting}</m.h1>
        </AnimatePresence>
      </div>
      <m.button type="button" className={styles.roundButton} aria-label="Settings" onClick={props.onSettings} whileTap={{ scale: 0.92 }} transition={spring.tap}><Settings2/></m.button>
    </m.header>

    <m.section variants={item} className={styles.hero}>
      <ArcGauge value={liveWeek / GOAL_MINUTES} label={`${Math.round((liveWeek / GOAL_MINUTES) * 100)}% of your weekly goal`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.p key={phase === "idle" ? "w" : "s"} className={styles.eyebrow} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: fade }} transition={spring.snappy}>{phase === "idle" ? "This week" : "On shift"}</m.p>
        </AnimatePresence>
        <div ref={number}>
          <RollingNumber value={phase === "idle" ? hm(weekMinutes) : hms(elapsed)} className={`${styles.big} ${phase !== "idle" ? styles.bigTimer : ""}`} label={phase === "idle" ? `${hm(weekMinutes)} worked this week` : `Shift time ${hms(elapsed)}`}/>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.p key={phase === "idle" ? "g" : "since"} className={styles.under} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade}>
            {phase === "idle" ? <>of <span className="numeric">37 h</span> goal</> : <>since <span className="numeric">{clockTime(startedAt)}</span></>}
          </m.p>
        </AnimatePresence>
      </ArcGauge>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.p key={insight} className={`${styles.insight} serif`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: fade }} transition={spring.smooth}>{insight}</m.p>
      </AnimatePresence>
    </m.section>

    <m.div variants={item}>
      <Glass blur className={styles.stats}>
        <Stat label="Today" value={hm(todayMinutes + (running ? elapsed / 60000 : 0))}/>
        <div ref={weekStat} className={styles.statWrap}>
          <m.div key={chipPulse} initial={chipPulse ? { scale: 1.14 } : false} animate={{ scale: 1 }} transition={spring.reward}><Stat label="This week" value={hm(weekMinutes)}/></m.div>
        </div>
        <Stat label="Shifts" value={String(recent.filter(r => r.day !== "Last week").length)}/>
      </Glass>
    </m.div>

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
              <Button variant="glass" size="small" icon={<StickyNote/>} onClick={props.onNote}>Note</Button>
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

    {flight && <m.span key={`${endedAt}`} className={`${styles.flight} numeric`} aria-hidden="true"
      initial={{ x: flight.x, y: flight.y, scale: 1.1, opacity: 0 }}
      animate={{ x: flight.toX, y: flight.toY, scale: 0.5, opacity: [0, 1, 1, 0] }}
      transition={{ x: spring.smooth, y: spring.smooth, scale: spring.smooth, opacity: { duration: 0.6, times: [0, 0.15, 0.75, 1] } }}>{flight.text}</m.span>}
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className={styles.stat}><span className={styles.statLabel}>{label}</span><RollingNumber value={value} className={styles.statValue}/></div>;
}
