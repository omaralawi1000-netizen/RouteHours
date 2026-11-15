"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, m, type PanInfo } from "motion/react";
import { spring, tf } from "./motion";
import styles from "./toast.module.css";

export type ToastMessage = { id: number; text: string; action?: { label: string; onClick: () => void } };

/**
 * One small message at the bottom of the screen. A new message replaces the one showing (the old
 * one sinks away as the new one rises in its place) instead of a second one stacking up. Swipe it
 * sideways to dismiss; otherwise it leaves on its own after a few seconds. The rise and the fade
 * run on the compositor; the fade is on the glass itself, so its blur never drops out.
 */
export default function Toast({ message, onDismiss, seconds = 5 }: { message: ToastMessage | null; onDismiss: () => void; seconds?: number }) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismiss.current(), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [message, seconds]);
  function end(_: unknown, info: PanInfo) { if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) onDismiss(); }
  return <div className={styles.stage} aria-live="polite">
    <AnimatePresence mode="popLayout">
      {message && <m.div key={message.id} className={styles.slot}
        initial={{ transform: tf({ y: 24, scale: 0.96 }) }} animate={{ transform: tf() }} exit={{ transform: tf({ y: 16, scale: 0.96 }), transition: spring.exit }} transition={spring.smooth}>
        <m.div className={styles.toast} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.exit }} transition={spring.smooth}
          drag="x" dragSnapToOrigin dragElastic={0.5} onDragEnd={end}>
          <span className={styles.text}>{message.text}</span>
          {message.action && <button type="button" data-press className={styles.action} onClick={() => { const action = message.action; onDismiss(); action?.onClick(); }}>{message.action.label}</button>}
        </m.div>
      </m.div>}
    </AnimatePresence>
  </div>;
}
