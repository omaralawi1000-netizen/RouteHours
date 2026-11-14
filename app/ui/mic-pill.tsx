"use client";

import { AnimatePresence, m } from "motion/react";
import { Mic, Square } from "lucide-react";
import { fade, spring } from "./motion";
import styles from "./mic-pill.module.css";

export type MicState = "idle" | "listening" | "writing";
const BARS = [0.55, 0.85, 1, 0.7, 0.9, 0.6, 0.8];

/**
 * The voice note button. Tap it and the round mic widens into a pill with a live waveform and a
 * timer, so you can see it hears you. Tap again to stop; it says "Writing…" while the words are
 * turned into text. One control, three states, no jump: the pill reshapes on the `smooth` spring.
 */
export default function MicPill({ state, level, seconds, onToggle, label = "Voice note" }: { state: MicState; level: number; seconds: number; onToggle: () => void; label?: string }) {
  const open = state !== "idle";
  return <m.button type="button" layout className={`${styles.mic} ${open ? styles.open : ""} ${state === "listening" ? styles.live : ""}`} style={{ borderRadius: 999 }}
    transition={spring.smooth} whileTap={{ scale: 0.97 }} onClick={onToggle} disabled={state === "writing"}
    aria-label={state === "listening" ? "Stop recording" : state === "writing" ? "Writing your note" : label} aria-pressed={state === "listening"}>
    <m.span layout="position" className={styles.icon} transition={spring.smooth}>{state === "listening" ? <Square fill="currentColor"/> : <Mic/>}</m.span>
    <AnimatePresence mode="popLayout" initial={false}>
      {state === "listening" && <m.span key="wave" className={styles.wave} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: fade }} transition={spring.smooth} aria-hidden="true">
        {BARS.map((weight, index) => <m.span key={index} className={styles.bar} initial={false} animate={{ scaleY: 0.18 + Math.min(1, level * weight * (0.75 + 0.5 * ((index * 37 + seconds * 13) % 7) / 7)) * 0.82 }} transition={spring.tap}/>)}
        <span className={`${styles.time} numeric`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
      </m.span>}
      {state === "writing" && <m.span key="writing" className={styles.writing} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: fade }} transition={fade}>Writing…</m.span>}
    </AnimatePresence>
  </m.button>;
}
