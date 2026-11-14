"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, AnimatePresence, m, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "motion/react";
import { fade, spring } from "./motion";
import { tick } from "./haptics";
import styles from "./hold-button.module.css";

const HOLD_SECONDS = 0.8;

/**
 * For the one action that can't be undone (emailing the timesheet). Press and hold: amber fills
 * the button over 0.8 s, then it commits with a light tick. Let go early and the fill springs back.
 * A quick tap explains "Hold to send". Keyboard and screen-reader users get a two-step confirm
 * instead, because a hold gesture alone would lock them out.
 */
export default function HoldButton({ children, confirmLabel = "Press again to send", onConfirm, disabled, icon }: { children: ReactNode; confirmLabel?: string; onConfirm: () => void; disabled?: boolean; icon?: ReactNode }) {
  const fill = useMotionValue(0);
  // The dark label is revealed exactly where amber has filled, so text stays readable on both.
  const reveal = useTransform(fill, value => `inset(0 ${(1 - value) * 100}% 0 0)`);
  const run = useRef<AnimationPlaybackControls | null>(null);
  const holding = useRef(false), done = useRef(false);
  const [hint, setHint] = useState(false), [armed, setArmed] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => { if (!hint && !armed) return; const t = window.setTimeout(() => { setHint(false); setArmed(false); }, 3200); return () => window.clearTimeout(t); }, [hint, armed]);
  useEffect(() => () => run.current?.stop(), []);

  function commit() { done.current = true; holding.current = false; tick(); setHint(false); setArmed(false); onConfirm(); window.setTimeout(() => { done.current = false; fill.set(0); }, 400); }
  function start(event: React.PointerEvent) {
    if (disabled || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    holding.current = true; setHint(false); setArmed(false);
    run.current?.stop();
    const remaining = HOLD_SECONDS * (1 - fill.get());
    run.current = animate(fill, 1, { duration: reduced ? Math.max(remaining, 0.3) : remaining, ease: "linear", onComplete: () => { if (holding.current) commit(); } });
  }
  function release() {
    if (!holding.current) return;
    holding.current = false;
    if (fill.get() < 1) { run.current?.stop(); if (fill.get() < 0.25) setHint(true); run.current = animate(fill, 0, spring.smooth); }
  }
  return <button type="button" className={styles.hold} disabled={disabled} aria-describedby={undefined}
    onPointerDown={start} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e => e.preventDefault()}
    onClick={event => { if (event.detail !== 0 || disabled) return; if (armed) commit(); else setArmed(true); }}>
    <m.span className={styles.fill} style={{ scaleX: fill }} aria-hidden="true"/>
    {[false, true].map(onFill => <m.span key={String(onFill)} className={`${styles.content} ${onFill ? styles.onFill : ""}`} style={onFill ? { clipPath: reveal } : undefined} aria-hidden={onFill || undefined}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span key={armed ? "armed" : hint ? "hint" : "label"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: fade }} transition={spring.snappy}>{armed ? confirmLabel : hint ? "Hold to send" : children}</m.span>
      </AnimatePresence>
    </m.span>)}
    <span className="sr-only" aria-live="polite">{armed ? confirmLabel : ""}</span>
  </button>;
}
