"use client";

import { useState } from "react";
import { AnimatePresence, m, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { spring } from "./motion";
import styles from "./week-strip.module.css";

export type WeekDay = { short: string; minutes: number; today?: boolean };
export type WeekData = { label: string; days: WeekDay[] };

function hm(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`; }

/**
 * Swipe sideways to move between weeks. The page follows your finger; past the threshold it
 * glides to the next week, otherwise it springs back. There is no week after this one, so a
 * pull that way stretches like a rubber band and returns (the edge guard).
 */
export default function WeekStrip({ weeks, index, onIndex }: { weeks: WeekData[]; index: number; onIndex: (index: number) => void }) {
  const [direction, setDirection] = useState(0);
  const week = weeks[index];
  const max = Math.max(...weeks.flatMap(w => w.days.map(d => d.minutes)), 1);
  const atStart = index === 0, atEnd = index === weeks.length - 1;
  function go(step: number) {
    const next = index + step;
    if (next < 0 || next >= weeks.length) return;
    setDirection(step); onIndex(next);
  }
  function end(_: unknown, info: PanInfo) {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe < -70) go(1); else if (swipe > 70) go(-1);
  }
  const total = week.days.reduce((sum, day) => sum + day.minutes, 0);
  return <div className={styles.strip}>
    <div className={styles.head}>
      <button type="button" className={styles.arrow} onClick={() => go(-1)} disabled={atStart} aria-label="Previous week"><ChevronLeft/></button>
      <div className={styles.titles} aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <m.div key={week.label} custom={direction} variants={slide} initial="enter" animate="center" exit="leave" transition={spring.smooth} className={styles.titleRow}>
            <span className={styles.label}>{week.label}</span>
            <span className={`${styles.total} numeric`}>{hm(total)}</span>
          </m.div>
        </AnimatePresence>
      </div>
      <button type="button" className={styles.arrow} onClick={() => go(1)} disabled={atEnd} aria-label="Next week"><ChevronRight/></button>
    </div>
    <m.div className={styles.track} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: atEnd ? 0.08 : 0.5, right: atStart ? 0.08 : 0.5 }} dragTransition={{ bounceStiffness: 420, bounceDamping: 36 }} onDragEnd={end}>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <m.div key={week.label} custom={direction} variants={slide} initial="enter" animate="center" exit="leave" transition={spring.smooth} className={styles.days}>
          {week.days.map((day, i) => <div key={i} className={`${styles.day} ${day.today ? styles.today : ""}`}>
            <div className={styles.barSlot}>
              <m.div className={styles.bar} initial={{ scaleY: 0 }} animate={{ scaleY: Math.max(day.minutes / max, 0.06) }} transition={{ ...spring.smooth, delay: i * 0.025 }}/>
            </div>
            <span className={styles.dayName}>{day.short}</span>
            <span className={`${styles.hours} numeric`}>{day.minutes ? hm(day.minutes) : "–"}</span>
          </div>)}
        </m.div>
      </AnimatePresence>
    </m.div>
  </div>;
}

const slide = {
  enter: (direction: number) => ({ x: direction >= 0 ? "60%" : "-60%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  leave: (direction: number) => ({ x: direction >= 0 ? "-60%" : "60%", opacity: 0, transition: spring.exit }),
};
