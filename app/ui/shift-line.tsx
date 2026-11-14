"use client";

import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./shift-line.module.css";

export type Break = { start: number; end?: number };

/**
 * The shift as a line from when you started to when you usually finish. The lit part grows as you
 * work, breaks show as gaps, and a small light rides the tip. It answers "how far am I?" at a glance.
 */
export default function ShiftLine({ startedAt, now, breaks, usualMinutes, startLabel, endLabel }: { startedAt: number; now: number; breaks: Break[]; usualMinutes: number; startLabel: string; endLabel: string }) {
  const span = Math.max(usualMinutes * 60000, now - startedAt);
  const at = (t: number) => Math.min(1, Math.max(0, (t - startedAt) / span));
  const progress = at(now);
  return <div className={styles.wrap}>
    <div className={styles.track}>
      <m.div className={styles.fill} initial={false} animate={{ scaleX: progress }} transition={spring.smooth}/>
      {breaks.map((b, i) => <div key={i} className={styles.gap} style={{ left: `${at(b.start) * 100}%`, width: `${Math.max(0.6, (at(b.end ?? now) - at(b.start)) * 100)}%` }}/>)}
      <m.div className={styles.tip} initial={false} animate={{ left: `${progress * 100}%` }} transition={spring.smooth}/>
    </div>
    <div className={`${styles.ends} numeric`}><span>{startLabel}</span><span>{endLabel}</span></div>
  </div>;
}
