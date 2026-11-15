"use client";

import { Bus, Coffee } from "lucide-react";
import styles from "./route-line.module.css";
import type { Break } from "./shift-line";

const HOUR = 3600000;

/**
 * Your shift drawn as a bus route. Every hour is a stop; the bus moves along the line once a
 * minute and its headlight lights the card around it. Nothing on it loops. Stops you have passed glow, the ones ahead are hollow.
 * Breaks you took are coffee stops on the line, and the next required break sits ahead as a coffee
 * stop too, so you can see how far it is.
 */
export default function RouteLine({ startedAt, now, breaks, usualMinutes, breakDueAt, paused, startLabel, endLabel, arrived = false }: {
  startedAt: number; now: number; breaks: Break[]; usualMinutes: number; breakDueAt: number | null; paused: boolean; startLabel: string; endLabel: string;
  /** Finish was tapped: the bus pulls in to the last stop before the card turns back into the week. */
  arrived?: boolean;
}) {
  // The bus moves once a minute (under a pixel a minute on a normal shift). Moving it every
  // second meant a short animation every second, and each one redraws the blurred card around it.
  const minute = Math.max(startedAt, Math.floor(now / 60000) * 60000);
  const span = Math.max(usualMinutes * 60000, minute - startedAt + HOUR / 4);
  const at = (t: number) => Math.min(1, Math.max(0, (t - startedAt) / span));
  const progress = arrived ? 1 : at(minute);
  const hours = Array.from({ length: Math.ceil(span / HOUR) - 1 }, (_, i) => (i + 1) * HOUR / span).filter(p => p < 0.97);
  // Rounded, so a value that only drifts by a rounding error never restyles the line.
  const pct = (p: number) => `${Math.round(p * 10000) / 100}%`;
  return <div className={styles.wrap}>
    <div className={styles.line}>
      {/* The light and the bus ride on full-width layers that slide by a CSS transform transition, so
          the browser moves them on its compositor and moving them never repaints the line. */}
      <div className={styles.travel} style={{ transform: `translateX(${pct(progress)})` }} aria-hidden="true">
        <div className={styles.light} style={{ opacity: paused ? 0.35 : 1 }}/>
      </div>
      <div className={styles.ahead} style={{ left: pct(progress) }}/>
      <div className={styles.done} style={{ transform: `scaleX(${Math.round(progress * 10000) / 10000})` }}/>
      {breaks.map((b, i) => <div key={`g${i}`} className={styles.gap} style={{ left: pct(at(b.start)), width: pct(Math.max(0.012, at(b.end ?? minute) - at(b.start))) }}/>)}
      <span className={`${styles.stop} ${styles.end} ${styles.passed}`} style={{ left: "0%" }}/>
      {hours.map(p => <span key={p} className={`${styles.stop} ${p <= progress ? styles.passed : ""}`} style={{ left: pct(p) }}/>)}
      <span className={`${styles.stop} ${styles.end} ${arrived ? styles.passed : ""}`} style={{ left: "100%" }}/>
      {breaks.filter(b => b.end).map((b, i) => <span key={`b${i}`} className={`${styles.cafe} ${styles.cafeTaken}`} style={{ left: pct(at(b.start)) }} aria-hidden="true"><Coffee/></span>)}
      {breakDueAt !== null && !paused && breakDueAt > now && <span className={styles.cafe} style={{ left: pct(at(breakDueAt)) }} aria-hidden="true"><Coffee/></span>}
      <div className={`${styles.travel} ${styles.front}`} style={{ transform: `translateX(${pct(progress)})` }}>
        <div className={styles.beam} style={{ opacity: paused ? 0 : 1 }} aria-hidden="true"/>
        <span className={`${styles.bus} ${paused ? styles.parked : ""}`}>{paused ? <Coffee aria-hidden="true"/> : <Bus aria-hidden="true"/>}</span>
      </div>
    </div>
    <div className={`${styles.ends} numeric`}><span>{startLabel}</span><span>{endLabel}</span></div>
  </div>;
}
