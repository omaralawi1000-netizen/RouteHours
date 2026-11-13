"use client";

import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./week-bars.module.css";

export type DayBar = { short: string; minutes: number; today?: boolean; mark?: string };

/** Seven small bars, Monday to Sunday: your week at a glance under the big number. Today is lit. */
export default function WeekBars({ days, tall = false }: { days: DayBar[]; tall?: boolean }) {
  const max = Math.max(...days.map(d => d.minutes), 480);
  return <div className={`${styles.bars} ${tall ? styles.tall : ""}`} role="img" aria-label={days.map(d => `${d.short} ${Math.round(d.minutes / 6) / 10} hours`).join(", ")}>
    {days.map((day, i) => <div key={i} className={`${styles.day} ${day.today ? styles.today : ""}`}>
      <div className={styles.slot}>
        <m.div className={styles.bar} initial={{ scaleY: 0 }} animate={{ scaleY: Math.max(day.minutes / max, 0.08) }} transition={{ ...spring.settle, delay: 0.15 + i * 0.04 }}/>
        {tall && day.minutes > 0 && <m.div className={styles.rise} initial={{ height: "0%" }} animate={{ height: `${Math.max(day.minutes / max, 0.08) * 100}%` }} transition={{ ...spring.settle, delay: 0.15 + i * 0.04 }}>
          <span className={`${styles.value} numeric`}>{Math.floor(day.minutes / 60)}:{String(Math.round(day.minutes % 60)).padStart(2, "0")}</span>
        </m.div>}
      </div>
      <span className={styles.label}>{day.mark ?? day.short}</span>
    </div>)}
  </div>;
}
