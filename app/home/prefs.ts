"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A small per-phone preference (wallpaper, blur, pay rate…). It is read after mount so the server
 * page and the first browser frame agree, and it never touches the saved shift records.
 */
export function usePref<T>(key: string, fallback: T, valid: (value: unknown) => value is T, legacyKey?: string): [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
      if (raw !== null) { const parsed = parse(raw); if (valid(parsed)) setValue(parsed); }
    } catch { /* private mode: keep the default */ }
    setReady(true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((next: T) => {
    setValue(next);
    try { localStorage.setItem(key, typeof next === "string" ? next : JSON.stringify(next)); } catch { /* applied, not remembered */ }
  }, [key]);
  return [value, set, ready];
}

function parse(raw: string): unknown { try { return JSON.parse(raw); } catch { return raw; } }

export const isBool = (v: unknown): v is boolean => typeof v === "boolean";
export const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
