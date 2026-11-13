"use client";

import { useRef, useState } from "react";

type Options = {
  geminiKey: string;
  accessCode: string;
  /** Builds the short context sent with a question (shift counts, totals, optionally the note draft). */
  context: (question: string) => string;
};

/** The "Ask RouteHours" helper: one question in, one answer out, through /api/assistant. */
export function useAssistant({ geminiKey, accessCode, context }: Options) {
  const latest = useRef({ geminiKey, accessCode, context });
  latest.current = { geminiKey, accessCode, context };
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function ask(input = question) {
    const asked = input.trim();
    if (!asked || busyRef.current) return;
    const { geminiKey: key, accessCode: code } = latest.current;
    setOpen(true); setQuestion(asked); setAnswer(""); setError("");
    if (!key.trim() && !code.trim()) { setError("Connect Gemini in Settings to ask a question."); return; }
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json", "x-app-access-token": code.trim() }, body: JSON.stringify({ question: asked, context: latest.current.context(asked), apiKey: key.trim() }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.answer !== "string") throw new Error(result?.error || "RouteHours could not answer. Try again.");
      setAnswer(result.answer);
    } catch (e) { setError(e instanceof TypeError ? "Could not connect. Try again online." : e instanceof Error ? e.message : "Could not answer."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return { open, setOpen, question, setQuestion, answer, error, busy, ask };
}
export type Assistant = ReturnType<typeof useAssistant>;
