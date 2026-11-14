"use client";

import { AnimatePresence, m } from "motion/react";
import { fade, spring } from "./motion";
import styles from "./rolling-number.module.css";

const DIGITS = "0123456789";

/**
 * A number with weight: when it changes, only the digits that changed roll to their new value;
 * the rest stay still. Characters are matched from the right, so "12h 30m" can roll into "0:00:00"
 * in place. Letters and separators that appear or leave fade, and the row glides to its new width.
 * With reduced motion, digits change without rolling.
 */
export default function RollingNumber({ value, className, label }: { value: string; className?: string; label?: string }) {
  const chars = [...value];
  return <span className={`${styles.number} numeric ${className ?? ""}`} role="text" aria-label={label ?? value}>
    <AnimatePresence initial={false} mode="popLayout">
      {chars.map((char, index) => {
        const fromRight = chars.length - index;
        const digit = DIGITS.indexOf(char);
        if (digit >= 0) return <m.span layout="position" transition={spring.snappy} key={`d${fromRight}`} className={styles.window} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }}>
          <m.span className={styles.strip} initial={false} animate={{ y: `${-digit * 10}%` }} transition={spring.snappy}>{DIGITS.split("").map(d => <span key={d}>{d}</span>)}</m.span>
          <span className={styles.sizer}>0</span>
        </m.span>;
        return <m.span layout="position" transition={spring.snappy} key={`c${fromRight}${char}`} className={/[a-z]/i.test(char) ? styles.unit : styles.mark} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: fade }} exit={{ opacity: 0, transition: fade }}>{char === " " ? " " : char}</m.span>;
      })}
    </AnimatePresence>
  </span>;
}
