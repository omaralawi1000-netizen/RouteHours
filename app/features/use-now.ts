"use client";

import { useEffect, useState } from "react";
import { dateInZone } from "@/lib/ledger";

/** The current time, refreshed every `everyMs`. Only components that show a live clock should use this. */
export function useNow(everyMs: number, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs, enabled]);
  return now;
}

/** Today's date key (YYYY-MM-DD) in `zone`. Re-renders only when the date changes, not every second. */
export function useToday(zone: string) {
  const [today, setToday] = useState(() => dateInZone(Date.now(), zone));
  useEffect(() => {
    const check = () => setToday(dateInZone(Date.now(), zone));
    check();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [zone]);
  return today;
}
