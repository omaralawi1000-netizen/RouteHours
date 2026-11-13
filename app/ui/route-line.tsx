"use client";

import { m } from "motion/react";
import { Bus, Coffee } from "lucide-react";
import { spring } from "./motion";
import styles from "./route-line.module.css";
import type { Break } from "./shift-line";

const HOUR = 3600000;

/**
 * Your shift drawn as a bus route. Every hour is a stop; the bus drives along the line and its
 * headlight lights the card around it. Stops you have passed glow, the ones ahead are hollow.
 * Breaks you took are coffee stops on the line, and the next required break sits ahead as a coffee
 * stop too, so you can see how far it is.
 */
export default function RouteLine({ startedAt, now, breaks, usualMinutes, breakDueAt, paused, startLabel, endLabel }: {
  startedAt: number; now: number; breaks: Break[]; usualMinutes: number; breakDueAt: number | null; paused: boolean; startLabel: string; endLabel: string;
}) {
  const span = Math.max(usualMinutes * 60000, now - startedAt + HOUR / 4);
  const at = (t: number) => Math.min(1, Math.max(0, (t - startedAt) / span));
  const progress = at(now);
  const hours = Array.from({ length: Math.ceil(span / HOUR) - 1 }, (_, i) => (i + 1) * HOUR / span).filter(p => p < 0.97);
  const pct = (p: number) => `${p * 100}%`;
  return <div className={styles.wrap}>
    <div className={styles.line}>
      <m.div className={styles.beam} initial={false} animate={{ left: pct(progress), opacity: paused ? 0 : 1 }} transition={spring.smooth} aria-hidden="true"/>
      <m.div className={styles.light} initial={false} animate={{ left: pct(progress), opacity: paused ? 0.35 : 1 }} transition={spring.smooth} aria-hidden="true"/>
      <div className={styles.ahead}/>
      <m.div className={styles.done} initial={false} animate={{ scaleX: progress }} transition={spring.smooth}/>
      {breaks.map((b, i) => <div key={`g${i}`} className={styles.gap} style={{ left: pct(at(b.start)), width: pct(Math.max(0.012, at(b.end ?? now) - at(b.start))) }}/>)}
      <span className={`${styles.stop} ${styles.end} ${styles.passed}`} style={{ left: "0%" }}/>
      {hours.map(p => <span key={p} className={`${styles.stop} ${p <= progress ? styles.passed : ""}`} style={{ left: pct(p) }}/>)}
      <span className={`${styles.stop} ${styles.end}`} style={{ left: "100%" }}/>
      {breaks.filter(b => b.end).map((b, i) => <span key={`b${i}`} className={`${styles.cafe} ${styles.cafeTaken}`} style={{ left: pct(at(b.start)) }} aria-hidden="true"><Coffee/></span>)}
      {breakDueAt !== null && !paused && breakDueAt > now && <span className={`${styles.cafe} ${breakDueAt <= now ? styles.cafeDue : ""}`} style={{ left: pct(at(breakDueAt)) }} aria-hidden="true"><Coffee/></span>}
      <m.div className={styles.busAt} initial={false} animate={{ left: pct(progress) }} transition={spring.smooth}>
        <span className={`${styles.bus} ${paused ? styles.parked : ""}`}>{paused ? <Coffee aria-hidden="true"/> : <Bus aria-hidden="true"/>}</span>
      </m.div>
    </div>
    <div className={`${styles.ends} numeric`}><span>{startLabel}</span><span>{endLabel}</span></div>
  </div>;
}
