"use client";

import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./week-bars.module.css";

export type DayBar = { short: string; minutes: number; today?: boolean; mark?: string };

/**
 * Seven small bars, Monday to Sunday: your week at a glance under the big number. Today is lit.
 * The bars grow by a `transform` string, which the browser animates on its compositor.
 */
export default function WeekBars({ days, tall = false }: { days: DayBar[]; tall?: boolean }) {
  const max = Math.max(...days.map(d => d.minutes), 480);
  // Rounded, so a value that only drifts by a rounding error never starts a new animation.
  const share = (minutes: number) => Math.round(Math.max(minutes / max, 0.08) * 1000) / 1000;
  return <div className={`${styles.bars} ${tall ? styles.tall : ""}`} role="img" aria-label={days.map(d => `${d.short} ${Math.round(d.minutes / 6) / 10} hours`).join(", ")}>
    {days.map((day, i) => <div key={i} className={`${styles.day} ${day.today ? styles.today : ""}`}>
      <div className={styles.slot}>
        <m.div className={styles.bar} initial={{ transform: "scaleY(0)" }} animate={{ transform: `scaleY(${share(day.minutes)})` }} transition={{ ...spring.settle, delay: 0.15 + i * 0.04 }}/>
        {tall && day.minutes > 0 && <m.div className={styles.rise} initial={{ transform: "translateY(100%)" }} animate={{ transform: `translateY(${(1 - share(day.minutes)) * 100}%)` }} transition={{ ...spring.settle, delay: 0.15 + i * 0.04 }}>
          <span className={`${styles.value} numeric`}>{Math.floor(day.minutes / 60)}:{String(Math.round(day.minutes % 60)).padStart(2, "0")}</span>
        </m.div>}
      </div>
      <span className={styles.label}>{day.mark ?? day.short}</span>
    </div>)}
  </div>;
}
