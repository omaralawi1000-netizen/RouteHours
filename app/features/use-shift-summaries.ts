"use client";

import { useEffect, useRef } from "react";
import type { Shift } from "@/lib/time";
import type { DataChange } from "../state/app-data";

type Options = { loaded: boolean; aiEnabled: boolean; geminiApiKey: string; accessCode: string; shifts: Shift[]; update: (change: DataChange) => void; onNotice: (message: string) => void };

/** Sends shifts marked "pending" to /api/summarize and stores the AI summary on the shift. */
export function useShiftSummaries({ loaded, aiEnabled, geminiApiKey, accessCode, shifts, update, onNotice }: Options) {
  const processing = useRef(new Set<string>());
  const notice = useRef(onNotice);
  notice.current = onNotice;
  useEffect(() => {
    if (!loaded || !aiEnabled || !(geminiApiKey || accessCode)) return;
    for (const shift of shifts) {
      if (shift.summaryStatus !== "pending" || processing.current.has(shift.id)) continue;
      processing.current.add(shift.id);
      void fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-app-access-token": accessCode },
        body: JSON.stringify({ start: shift.start, end: shift.end, notes: shift.notes, ...(geminiApiKey ? { apiKey: geminiApiKey } : {}) }),
      }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Summary unavailable");
        // Only apply the summary if the shift hasn't been edited meanwhile.
        update(current => ({ shifts: current.shifts.map(item => item.id === shift.id && item.start === shift.start && item.end === shift.end && JSON.stringify(item.notes) === JSON.stringify(shift.notes) ? { ...item, summary: result.summary, summaryStatus: "done", summaryError: undefined } : item) }));
      }).catch(error => {
        const message = error instanceof Error ? error.message : "Summary unavailable";
        update(current => ({ shifts: current.shifts.map(item => item.id === shift.id ? { ...item, summaryStatus: "error", summaryError: message } : item) }));
        notice.current(message);
      }).finally(() => processing.current.delete(shift.id));
    }
  }, [loaded, aiEnabled, accessCode, geminiApiKey, shifts, update]);
}
