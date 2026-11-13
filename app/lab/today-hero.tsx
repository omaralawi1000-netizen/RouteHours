"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Play, Square, FastForward } from "lucide-react";
import { useNow } from "../features/use-now";
import Button from "../ui/button";
import Glow from "../ui/glow";
import RollingNumber from "../ui/rolling-number";
import SavedCard from "../ui/saved-card";
import { fade, spring } from "../ui/motion";
import styles from "./lab.module.css";

export type Phase = "idle" | "running" | "landing";

export function hm(minutes: number) { return `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`; }
export function hms(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function clockTime(ms: number) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }).format(ms); }

/**
 * The Today screen's top half, as the lab shows it. All state lives in the lab so the same hero
 * can be drawn twice (Night and Day) for the split comparison and both stay in step.
 */
export default function TodayHero({ look, phase, startedAt, endedAt, weekMinutes, chipPulse, dateLabel, saved, onUndo, onStart, onFinish, onFastForward }: {
  look: "night" | "day"; phase: Phase; startedAt: number; endedAt: number; weekMinutes: number; chipPulse: number; dateLabel: string;
  saved: string | null; onUndo: () => void; onStart: () => void; onFinish: () => void; onFastForward: () => void;
}) {
  const running = phase === "running";
  const now = useNow(1000, running);
  const elapsed = (phase === "landing" ? endedAt : now) - startedAt;
  const hero = useRef<HTMLElement>(null), number = useRef<HTMLDivElement>(null), chip = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<{ x: number; y: number; toX: number; toY: number; text: string } | null>(null);

  // When a shift finishes, its length lifts off the big number and flies into the week chip.
  useLayoutEffect(() => {
    if (phase !== "landing") { setFlight(null); return; }
    const box = hero.current?.getBoundingClientRect(), from = number.current?.getBoundingClientRect(), to = chip.current?.getBoundingClientRect();
    if (!box || !from || !to) return;
    setFlight({ x: from.left + from.width / 2 - box.left, y: from.top + from.height / 2 - box.top, toX: to.left + to.width - 28 - box.left, toY: to.top + to.height / 2 - box.top, text: `+${hm(Math.round((endedAt - startedAt) / 60000))}` });
  }, [phase, endedAt, startedAt]);

  const showChip = phase !== "idle";
  return <section ref={hero} className={styles.hero} data-look={look}>
    <Glow state={running ? "running" : "idle"} look={look} className={styles.heroGlow}/>
    <div className={styles.heroInner}>
      <p className={styles.date}>{dateLabel}</p>
      <div className={styles.chipRow}>
        <AnimatePresence>
          {showChip && <m.div ref={chip} key="chip" className={styles.chip} initial={{ opacity: 0, y: -8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96, transition: spring.exit }} transition={spring.settle}>
            <span className={styles.chipLabel}>This week</span>
            <m.span key={chipPulse} initial={chipPulse ? { scale: 1.12 } : false} animate={{ scale: 1 }} transition={spring.reward} className={styles.chipValue}>
              <RollingNumber value={hm(weekMinutes)} label={`${hm(weekMinutes)} this week`}/>
            </m.span>
          </m.div>}
        </AnimatePresence>
      </div>
      <div ref={number} className={styles.bigWrap}>
        <RollingNumber value={phase === "idle" ? hm(weekMinutes) : hms(elapsed)} className={styles.big} label={phase === "idle" ? `${hm(weekMinutes)} worked this week` : `Shift time ${hms(elapsed)}`}/>
      </div>
      <div className={styles.caption}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.p key={phase === "idle" ? "idle" : "run"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: fade }} transition={spring.snappy}>
            {phase === "idle" ? "worked this week" : <>on shift since <span className="numeric">{clockTime(startedAt)}</span></>}
          </m.p>
        </AnimatePresence>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" size="main" className={styles.mainButton} onClick={phase === "landing" ? undefined : running ? onFinish : onStart}
          icon={<AnimatePresence mode="popLayout" initial={false}><m.span key={String(running)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0, transition: fade }} transition={spring.snappy} style={{ display: "inline-flex" }}>{running ? <Square fill="currentColor"/> : <Play fill="currentColor"/>}</m.span></AnimatePresence>}>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span key={String(running)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: fade }} transition={spring.snappy}>{running ? "Finish shift" : "Start shift"}</m.span>
          </AnimatePresence>
        </Button>
        <div className={styles.belowSlot}>
          <AnimatePresence mode="popLayout" initial={false}>
            {running && <m.div key="ff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade}>
              <Button variant="quiet" size="small" icon={<FastForward/>} onClick={onFastForward}>Lab: jump 1 hour</Button>
            </m.div>}
          </AnimatePresence>
          <SavedCard shown={!!saved && phase === "idle"} detail={saved ?? ""} onUndo={onUndo}/>
        </div>
      </div>
    </div>
    {flight && <m.span key={`${endedAt}`} className={`${styles.flight} numeric`} aria-hidden="true"
      initial={{ x: flight.x, y: flight.y, scale: 1, opacity: 0 }}
      animate={{ x: flight.toX, y: flight.toY, scale: 0.55, opacity: [0, 1, 1, 0] }}
      transition={{ x: spring.smooth, y: spring.smooth, scale: spring.smooth, opacity: { duration: 0.55, times: [0, 0.15, 0.7, 1] } }}>{flight.text}</m.span>}
  </section>;
}
