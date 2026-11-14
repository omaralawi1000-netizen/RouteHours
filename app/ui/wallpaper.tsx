"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { ROAD, SCENES, sceneStyle, type SceneId } from "./wallpaper-scenes";
import styles from "./wallpaper.module.css";

export type WallpaperState = "idle" | "running";

/**
 * The living wallpaper. Six scenes share one sky whose colours are animatable CSS properties,
 * so switching scene, or starting a shift (the horizon warms), is one smooth blend, never a cut.
 * The silhouettes crossfade and the light drifts slowly. The wallpaper stays still while you
 * scroll: a scroll-linked parallax runs a frame behind the page on phones and makes it swim, and
 * every move under the glass costs a fresh blur. The drift pauses while you scroll for the same
 * reason. It is sized to the tallest screen (lvh), so it never jumps when Chrome's address bar
 * hides. Only transform and opacity animate. A fine grain hides gradient banding.
 */
export default function Wallpaper({ scene: sceneId, state, thumb = false }: { scene: SceneId; state: WallpaperState; thumb?: boolean }) {
  const scene = SCENES.find(s => s.id === sceneId) ?? SCENES[0];
  const wall = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (thumb) return;
    // While you scroll or touch the screen (a tap that switches tabs, a sheet you drag), the light
    // holds still, so the phone only redraws what you're moving.
    let timer = 0, touching = false;
    const hold = () => { wall.current?.setAttribute("data-hold", ""); window.clearTimeout(timer); };
    const release = (after: number) => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!touching) wall.current?.removeAttribute("data-hold"); }, after); };
    const onScroll = () => { hold(); release(180); };
    const onDown = () => { touching = true; hold(); };
    const onUp = () => { touching = false; release(600); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll); window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); window.clearTimeout(timer);
    };
  }, [thumb]);
  const running = state === "running";
  return <div ref={wall} className={`${styles.wall} ${thumb ? styles.thumb : ""}`} data-state={state} data-stars={scene.stars ? "on" : "off"} style={sceneStyle(scene, running)} aria-hidden="true">
    <div className={styles.sky}>
      <div className={`${styles.blob} ${styles.b1}`}/>
      <div className={`${styles.blob} ${styles.b2}`}/>
      <div className={`${styles.blob} ${styles.b3}`}/>
      <div className={styles.stars}/>
    </div>
    <svg className={styles.hills} viewBox="0 0 400 320" preserveAspectRatio="xMidYMax slice">
      <AnimatePresence initial={false}>
        <m.g key={scene.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: [0.2, 0, 0, 1] }}>
          {scene.art}
          {scene.road && running && <g className={styles.headlight}>
            <circle r="9" className={styles.beam}/>
            <circle r="2.4" className={styles.lamp}/>
            <animateMotion dur="11s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path={ROAD}/>
          </g>}
        </m.g>
      </AnimatePresence>
    </svg>
    <div className={styles.grain}/>
  </div>;
}
