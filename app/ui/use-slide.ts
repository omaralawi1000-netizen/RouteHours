"use client";

import { useLayoutEffect, useRef } from "react";
import { cssSpring, isReducedMotion } from "./motion";

/**
 * When `key` changes and the element ends up somewhere else (a notice appeared or left above it),
 * it slides from where it was to where it is now instead of jumping. The slide is one transform
 * the browser runs on its compositor, so it stays smooth while the page is busy. It starts in the
 * same frame as the move (the browser's own el.animate, not Motion's, which waits a frame and
 * would flash the card at its new place first). The element is measured only when the key changes.
 */
export function useSlide<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const lastKey = useRef(key);
  const from = useRef<number | null>(null);
  const slide = useRef<Animation | null>(null);
  // Read where it is on screen now (mid-slide included), before React changes the page.
  if (lastKey.current !== key) { lastKey.current = key; from.current = ref.current?.getBoundingClientRect().top ?? null; }
  useLayoutEffect(() => {
    const el = ref.current, before = from.current;
    from.current = null;
    if (!el || before === null) return;
    slide.current?.cancel(); slide.current = null;
    if (isReducedMotion()) return;
    const offset = before - el.getBoundingClientRect().top;
    if (Math.abs(offset) < 1) return;
    slide.current = el.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0px)" }], cssSpring("smooth"));
  }, [key]);
  return ref;
}
