"use client";

import { AnimatePresence, m } from "motion/react";
import { fade, spring } from "./motion";
import styles from "./status-pill.module.css";

export type WeekStatus = "draft" | "reviewed" | "sent" | "changed";
const LABEL: Record<WeekStatus, string> = { draft: "Draft", reviewed: "Reviewed", sent: "Sent", changed: "Changed since sending" };

/** The week's state. When it changes, the new label slides in and the pill resizes around it. */
export default function StatusPill({ status, className, pulse }: { status: WeekStatus; className?: string; pulse?: number }) {
  return <m.span layout transition={spring.snappy} className={`${styles.pill} ${styles[status]} ${className ?? ""}`} role="status" style={{ borderRadius: 999 }}>
    <m.span key={pulse} className={styles.dot} initial={pulse ? { scale: 2.4, opacity: 0.4 } : false} animate={{ scale: 1, opacity: 1 }} transition={spring.reward}/>
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span key={status} layout="position" className={styles.label} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0, transition: fade }} transition={spring.snappy}>{LABEL[status]}</m.span>
    </AnimatePresence>
  </m.span>;
}
