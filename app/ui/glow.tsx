"use client";

import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./glow.module.css";

export type GlowState = "idle" | "running";

/**
 * The one soft light in the room. Off duty it's a faint cool blue; while a shift runs it warms to amber.
 *
 * Soft dark gradients show rings ("banding") in Chrome on Omar's phone, so the glow is not a CSS
 * gradient: it is painted once into a canvas at the screen's real pixel density with a little
 * random dither, which hides the rings. Both states are always on screen and only their opacity
 * changes, so no layer is ever added mid-animation (that causes black frames).
 */
export default function Glow({ state, look, className }: { state: GlowState; look: string; className?: string }) {
  const idle = useRef<HTMLCanvasElement>(null), running = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const paint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const [canvas, kind] of [[idle.current, "idle"], [running.current, "run"]] as const) if (canvas) paintGlow(canvas, kind);
      });
    };
    paint();
    const observer = new ResizeObserver(paint);
    if (idle.current) observer.observe(idle.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [look]);
  return <div className={`${styles.glow} ${className ?? ""}`} aria-hidden="true">
    <m.canvas ref={idle} className={styles.layer} initial={false} animate={{ opacity: state === "idle" ? 1 : 0 }} transition={spring.smooth}/>
    <m.canvas ref={running} className={styles.layer} initial={false} animate={{ opacity: state === "running" ? 1 : 0 }} transition={spring.smooth}/>
  </div>;
}

function rgb(value: string) { const [r, g, b] = value.trim().split(/\s+/).map(Number); return [r || 0, g || 0, b || 0]; }

function paintGlow(canvas: HTMLCanvasElement, kind: "idle" | "run") {
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.round(box.width * dpr), height = Math.round(box.height * dpr);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const style = getComputedStyle(canvas);
  const bg = rgb(hexToRgb(style.getPropertyValue("--bg")));
  const glow = rgb(style.getPropertyValue(kind === "idle" ? "--glow-idle" : "--glow-run"));
  const strength = parseFloat(style.getPropertyValue(kind === "idle" ? "--glow-idle-strength" : "--glow-run-strength")) || 0.2;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const image = context.createImageData(width, height), data = image.data;
  // An ellipse of light centred behind the hero number, falling off smoothly to the background.
  const cx = width * 0.5, cy = height * 0.3, rx = width * 0.95, ry = height * 0.42;
  let seed = 1234567;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < height; y++) {
    const dy = (y - cy) / ry;
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const fall = 1 - d * d * (3 - 2 * d);
      const a = strength * fall * fall;
      // Triangular dither of about ±1 step per channel breaks the 8-bit steps into invisible noise.
      const noise = random() + random() - 1;
      const i = (y * width + x) * 4;
      data[i] = bg[0] + (glow[0] - bg[0]) * a + noise;
      data[i + 1] = bg[1] + (glow[1] - bg[1]) * a + noise;
      data[i + 2] = bg[2] + (glow[2] - bg[2]) * a + noise;
      data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function hexToRgb(value: string) {
  const hex = value.trim().replace("#", "");
  if (hex.length !== 6) return "0 0 0";
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}
