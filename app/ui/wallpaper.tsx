"use client";

import { AnimatePresence, m, useScroll, useTransform } from "motion/react";
import { ROAD, SCENES, sceneStyle, type SceneId } from "./wallpaper-scenes";
import styles from "./wallpaper.module.css";

export type WallpaperState = "idle" | "running";

/**
 * The living wallpaper. Six scenes share one sky whose colours are animatable CSS properties,
 * so switching scene, or starting a shift (the horizon warms), is one smooth blend, never a cut.
 * The silhouettes crossfade. Light drifts slowly and the hills move a little slower than the
 * page as you scroll. Only transform and opacity animate. A fine grain hides gradient banding.
 */
export default function Wallpaper({ scene: sceneId, state, thumb = false }: { scene: SceneId; state: WallpaperState; thumb?: boolean }) {
  const scene = SCENES.find(s => s.id === sceneId) ?? SCENES[0];
  const { scrollY } = useScroll();
  const hills = useTransform(scrollY, [0, 900], [0, thumb ? 0 : -70]);
  const sky = useTransform(scrollY, [0, 900], [0, thumb ? 0 : -24]);
  const running = state === "running";
  return <div className={`${styles.wall} ${thumb ? styles.thumb : ""}`} data-state={state} data-stars={scene.stars ? "on" : "off"} style={sceneStyle(scene, running)} aria-hidden="true">
    <m.div className={styles.sky} style={{ y: sky }}>
      <div className={`${styles.blob} ${styles.b1}`}/>
      <div className={`${styles.blob} ${styles.b2}`}/>
      <div className={`${styles.blob} ${styles.b3}`}/>
      <div className={styles.stars}/>
    </m.div>
    <m.svg className={styles.hills} viewBox="0 0 400 320" preserveAspectRatio="xMidYMax slice" style={{ y: hills }}>
      <AnimatePresence initial={false}>
        <m.g key={scene.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: [0.2, 0, 0, 1] }}>
          {scene.art}
          {scene.road && <g className={styles.headlight}>
            <circle r="9" className={styles.beam}/>
            <circle r="2.4" className={styles.lamp}/>
            <animateMotion dur="11s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path={ROAD}/>
          </g>}
        </m.g>
      </AnimatePresence>
    </m.svg>
    <div className={styles.grain}/>
  </div>;
}
