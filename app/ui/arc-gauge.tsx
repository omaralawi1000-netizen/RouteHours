"use client";

import { useId, type ReactNode } from "react";
import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./arc-gauge.module.css";

const TICKS = 60, START = 205, SWEEP = 230, R_OUT = 150, R_IN = 138, CX = 160, CY = 160;
const rad = (deg: number) => (deg * Math.PI) / 180;
const point = (deg: number, r: number) => [CX + r * Math.cos(rad(deg)), CY - r * Math.sin(rad(deg))] as const;

/**
 * A ring of fine ticks around the hero number, filling as the week fills. The lit part is a mask
 * that glides on the `smooth` spring, so progress always sweeps instead of jumping, and the tip
 * carries a soft glow so you can see where you are.
 */
export default function ArcGauge({ value, children, label }: { value: number; children: ReactNode; label: string }) {
  const id = useId().replace(/:/g, "");
  const progress = Math.max(0, Math.min(1, value));
  const [sx, sy] = point(START, (R_OUT + R_IN) / 2), [ex, ey] = point(START - SWEEP, (R_OUT + R_IN) / 2);
  const arc = `M${sx} ${sy} A${(R_OUT + R_IN) / 2} ${(R_OUT + R_IN) / 2} 0 1 1 ${ex} ${ey}`;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const deg = START - (SWEEP * i) / TICKS, major = i % 10 === 0;
    const [x1, y1] = point(deg, major ? R_IN - 5 : R_IN), [x2, y2] = point(deg, R_OUT);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? styles.major : undefined}/>;
  });
  return <div className={styles.gauge} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
    <svg viewBox="0 0 320 250" className={styles.svg} aria-hidden="true">
      <defs>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse">
          <m.path d={arc} stroke="#fff" strokeWidth="40" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(progress, 0.0001) }} transition={spring.smooth}/>
        </mask>
        <filter id={`g${id}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g className={styles.base}>{ticks}</g>
      <g className={styles.lit} mask={`url(#m${id})`} filter={`url(#g${id})`}>{ticks}</g>
    </svg>
    <div className={styles.center}>{children}</div>
  </div>;
}
