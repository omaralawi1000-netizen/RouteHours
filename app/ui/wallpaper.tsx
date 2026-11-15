"use client";

import { AnimatePresence, m } from "motion/react";
import { SCENES, sceneStyle, type Scene, type SceneId } from "./wallpaper-scenes";
import styles from "./wallpaper.module.css";

export type WallpaperState = "idle" | "running";

/**
 * The wallpaper. Six scenes, each a sky, soft light and one silhouette, painted once and then left
 * completely still: anything that moves under the glass makes every blurred card redo its blur on
 * every frame, which is what made the app lag and drain the battery. Starting a shift warms the
 * scene by fading in a second, warmer copy painted ahead of time (a fade costs nothing to draw),
 * and a new scene fades in the same way. Sized to the tallest screen (lvh), so it never jumps
 * when Chrome's address bar hides, and it never scrolls. A fine grain hides gradient banding.
 */
export default function Wallpaper({ scene: sceneId, state, thumb = false }: { scene: SceneId; state: WallpaperState; thumb?: boolean }) {
  const scene = SCENES.find(s => s.id === sceneId) ?? SCENES[0];
  if (thumb) return <div className={`${styles.wall} ${styles.thumb}`} aria-hidden="true"><Plate scene={scene} warm={false}/></div>;
  const running = state === "running";
  return <div className={styles.wall} data-state={state} aria-hidden="true">
    <AnimatePresence initial={false}>
      <m.div key={scene.id} className={styles.scene} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}>
        <Plate scene={scene} warm={false}/>
        <Plate scene={scene} warm className={`${styles.warm} ${running ? styles.on : ""}`}/>
      </m.div>
    </AnimatePresence>
    <div className={styles.grain}/>
  </div>;
}

/** One painted copy of a scene, in its idle colours or its warmer on-shift colours. */
function Plate({ scene, warm, className }: { scene: Scene; warm: boolean; className?: string }) {
  return <div className={`${styles.plate} ${className ?? ""}`} style={sceneStyle(scene, warm)} data-stars={scene.stars ? (warm ? "dim" : "on") : "off"} data-warm={warm ? "" : undefined}>
    <div className={styles.sky}>
      <div className={`${styles.blob} ${styles.b1}`}/>
      <div className={`${styles.blob} ${styles.b2}`}/>
      <div className={`${styles.blob} ${styles.b3}`}/>
      <div className={styles.stars}/>
    </div>
    <svg className={styles.hills} viewBox="0 0 400 320" preserveAspectRatio="xMidYMax slice">{scene.art}</svg>
  </div>;
}
