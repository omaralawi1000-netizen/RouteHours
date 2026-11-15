"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { fade, spring } from "./motion";
import styles from "./saved-card.module.css";

/**
 * The receipt after Finish: a check draws itself, the shift's length shows, and Undo sits right
 * there. Undo wakes up after 0.6 s so the same thumb that pressed Finish can't hit it by accident.
 */
export default function SavedCard({ shown, title = "Shift saved", detail, onUndo }: { shown: boolean; title?: string; detail: string; onUndo?: () => void }) {
  return <AnimatePresence>{shown && <Card key="saved" title={title} detail={detail} onUndo={onUndo}/>}</AnimatePresence>;
}

function Card({ title, detail, onUndo }: { title: string; detail: string; onUndo?: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setReady(true), 600); return () => window.clearTimeout(timer); }, []);
  return <m.div className={styles.card} role="status" initial={{ y: 16, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96, transition: spring.exit }} transition={spring.settle}>
    <svg className={styles.check} viewBox="0 0 32 32" aria-hidden="true">
      <m.circle cx="16" cy="16" r="14" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...spring.smooth, delay: 0.05 }}/>
      <m.path d="M10 16.5l4 4 8-9" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...spring.smooth, delay: 0.22 }}/>
    </svg>
    <div className={styles.text}>
      <p className={styles.title}>{title}</p>
      <p className={`${styles.detail} numeric`}>{detail}</p>
    </div>
    {onUndo && <m.button type="button" className={styles.undo} onClick={onUndo} disabled={!ready} initial={{ opacity: 0.4 }} animate={{ opacity: ready ? 1 : 0.4 }} transition={fade} whileTap={ready ? { scale: 0.97 } : undefined}>Undo</m.button>}
  </m.div>;
}
