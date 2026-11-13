"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, m, type PanInfo } from "motion/react";
import { fade, spring } from "./motion";
import styles from "./toast.module.css";

export type ToastMessage = { id: number; text: string; action?: { label: string; onClick: () => void } };

/**
 * One small message at the bottom of the screen. If a new message arrives while one is showing,
 * the same pill reshapes around the new text instead of a second one stacking up. Swipe it
 * sideways to dismiss; otherwise it leaves on its own after a few seconds.
 */
export default function Toast({ message, onDismiss, seconds = 4 }: { message: ToastMessage | null; onDismiss: () => void; seconds?: number }) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismiss.current(), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [message, seconds]);
  function end(_: unknown, info: PanInfo) { if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) onDismiss(); }
  return <div className={styles.stage} aria-live="polite">
    <AnimatePresence>
      {message && <m.div key="toast" layout className={styles.toast} style={{ borderRadius: 999 }}
        initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1, x: 0 }} exit={{ y: 16, opacity: 0, scale: 0.96, transition: spring.exit }} transition={spring.smooth}
        drag="x" dragSnapToOrigin dragElastic={0.5} onDragEnd={end}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span key={message.id} layout="position" className={styles.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: fade }} transition={spring.snappy}>{message.text}</m.span>
        </AnimatePresence>
        {message.action && <m.button layout="position" type="button" className={styles.action} onClick={() => { message.action?.onClick(); onDismiss(); }}>{message.action.label}</m.button>}
      </m.div>}
    </AnimatePresence>
  </div>;
}
