"use client";

import { m, useScroll, useTransform } from "motion/react";
import styles from "./wallpaper.module.css";

export type WallpaperState = "idle" | "running";

/**
 * The living wallpaper: a dusk (Night) or dawn (Day) sky over layered hills, with a road winding
 * toward you. Its light drifts slowly. When a shift starts, the horizon warms into amber and a
 * headlight travels down the road; when it ends, the sky cools again. All colours are animatable
 * CSS properties, so the change is one smooth blend, never a cut. Only transform and opacity
 * animate, so it stays cheap at 120 Hz. A fine grain hides gradient banding.
 */
export default function Wallpaper({ state }: { state: WallpaperState }) {
  const { scrollY } = useScroll();
  const hills = useTransform(scrollY, [0, 900], [0, -70]);
  const sky = useTransform(scrollY, [0, 900], [0, -24]);
  return <div className={styles.wall} data-state={state} aria-hidden="true">
    <m.div className={styles.sky} style={{ y: sky }}>
      <div className={`${styles.blob} ${styles.b1}`}/>
      <div className={`${styles.blob} ${styles.b2}`}/>
      <div className={`${styles.blob} ${styles.b3}`}/>
      <div className={styles.stars}/>
    </m.div>
    <m.svg className={styles.hills} viewBox="0 0 400 320" preserveAspectRatio="xMidYMax slice" style={{ y: hills }}>
      <path className={styles.far} d="M0 132 Q22 112 44 120 Q66 96 92 108 Q118 70 146 100 Q168 86 188 104 Q214 64 246 98 Q270 84 292 102 Q322 74 352 100 Q378 90 400 106 V320 H0Z"/>
      <path className={styles.haze} d="M0 150 Q100 130 200 148 T400 140 V320 H0Z"/>
      <path className={styles.mid} d="M0 186 Q48 160 104 178 Q160 196 214 170 Q272 146 330 172 Q368 188 400 176 V320 H0Z"/>
      <path className={styles.road} d="M228 320 C222 290 168 276 184 252 C198 232 252 222 236 200 C226 188 206 186 214 176"/>
      <path className={styles.near} d="M0 236 Q70 204 150 228 Q196 242 230 236 Q300 220 400 232 V320 H0Z"/>
      <path className={styles.roadNear} d="M262 320 C256 300 236 286 232 262"/>
      <g className={styles.headlight}>
        <circle r="9" className={styles.beam}/>
        <circle r="2.4" className={styles.lamp}/>
        <animateMotion dur="11s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="M228 320 C222 290 168 276 184 252 C198 232 252 222 236 200 C226 188 206 186 214 176"/>
      </g>
    </m.svg>
    <div className={styles.grain}/>
  </div>;
}
