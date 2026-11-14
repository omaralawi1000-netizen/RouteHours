"use client";

import { useEffect, useState } from "react";
import type { ThemeMode } from "@/lib/stored-data";

/** Applies the saved theme to the page and the phone's status bar. Returns whether dark is showing. */
export function useTheme(themeMode: ThemeMode, loaded: boolean) {
  const [prefersDark, setPrefersDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPrefersDark(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode === "system" ? "light dark" : themeMode;
    const dark = themeMode === "dark" || themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.removeAttribute("media"); meta.content = dark ? "#111b31" : "#edf3ff"; });
  }, [loaded, themeMode, prefersDark]);
  return themeMode === "dark" || themeMode === "system" && prefersDark;
}
