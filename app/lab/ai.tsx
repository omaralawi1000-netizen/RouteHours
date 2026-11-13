"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { ArrowUp, Camera, ClipboardPaste, KeyRound, Sparkles } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
import MicPill, { type MicState } from "../ui/mic-pill";
import { spring } from "../ui/motion";
import type { Media, Payslip } from "../api/ai/tasks";
import { hm, RATE } from "./today";
import styles from "./ai.module.css";
import lab from "./lab.module.css";

/** One Gemini key for everything AI in the lab: voice notes, questions and payslips. */
const KEY = "routehours:lab-gemini";
export function useGeminiKey(): [string, (next: string) => void] {
  const [key, setKey] = useState("");
  useEffect(() => { try { setKey(localStorage.getItem(KEY) ?? ""); } catch { /* none saved */ } }, []);
  return [key, next => { setKey(next); try { if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY); } catch { /* kept for this visit */ } }];
}

export async function callAi<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Try again.");
  return data as T;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A phone photo shrunk to 1600 px, so it uploads fast and stays far under the size limit. */
async function photo(file: File): Promise<Media> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("photo")), "image/jpeg", 0.85));
  return { type: "image/jpeg", data: await base64(blob) };
}

const LONGEST = 60;

/**
 * Tap to record, tap again to stop; Gemini writes down what was said. The pill's waveform follows
 * the real microphone level. Stops by itself after a minute.
 */
export function useVoice({ apiKey, onText, onError }: { apiKey: string; onText: (text: string) => void; onError: (message: string) => void }) {
  const [mic, setMic] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const live = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; stopTimer: number; meter: number; audio: AudioContext } | null>(null);
  const handlers = useRef({ onText, onError });
  handlers.current = { onText, onError };

  useEffect(() => () => { const l = live.current; if (l) { l.stream.getTracks().forEach(t => t.stop()); window.clearInterval(l.meter); window.clearTimeout(l.stopTimer); void l.audio.close(); } }, []);

  async function begin() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { handlers.current.onError("This browser can't record. Use Chrome."); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { handlers.current.onError("Microphone blocked. Allow it in Chrome's site settings."); return; }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const audio = new AudioContext();
    const analyser = audio.createAnalyser(); analyser.fftSize = 256;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const begun = Date.now();
    const meter = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0; for (const s of samples) peak = Math.max(peak, Math.abs(s - 128));
      setLevel(Math.min(1, peak / 50));
      setSeconds(Math.floor((Date.now() - begun) / 1000));
    }, 90);
    const stopTimer = window.setTimeout(() => void finish(), LONGEST * 1000);
    live.current = { recorder, stream, chunks, stopTimer, meter, audio };
    recorder.start();
    setSeconds(0); setLevel(0.2); setMic("listening");
  }

  async function finish() {
    const l = live.current;
    if (!l) return;
    live.current = null;
    window.clearTimeout(l.stopTimer); window.clearInterval(l.meter);
    setMic("writing");
    const stopped = new Promise<void>(resolve => { l.recorder.onstop = () => resolve(); });
    l.recorder.stop();
    await stopped;
    l.stream.getTracks().forEach(t => t.stop());
    void l.audio.close();
    try {
      const blob = new Blob(l.chunks, { type: l.recorder.mimeType || "audio/webm" });
      if (blob.size < 800) throw new Error("That was too short. Hold on a second longer.");
      const { text } = await callAi<{ text: string }>({ task: "listen", key: apiKey, audio: { type: blob.type, data: await base64(blob) } });
      handlers.current.onText(text);
    } catch (error) { handlers.current.onError(error instanceof Error ? error.message : "Couldn't write that down."); }
    finally { setMic("idle"); }
  }

  function toggle() {
    if (mic === "writing") return;
    if (!apiKey) { handlers.current.onError("Paste your Gemini key in Lab first."); return; }
    if (mic === "idle") void begin(); else void finish();
  }
  return { mic, level, seconds, toggle };
}

/** Lab tab: paste the Gemini key once, test it, done. */
export function GeminiCard({ apiKey, onSave, say }: { apiKey: string; onSave: (key: string) => void; say: (text: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(value = text) {
    const key = value.trim();
    if (!key) { say("Paste the key first"); return; }
    setBusy(true);
    try { await callAi({ task: "test", key }); onSave(key); setText(""); say("Gemini is connected"); }
    catch (error) { say(error instanceof Error ? error.message : "That key didn't work"); }
    finally { setBusy(false); }
  }
  async function paste() {
    try { const clip = (await navigator.clipboard.readText()).trim(); setText(clip); if (clip) await save(clip); }
    catch { say("Long-press the box and tap Paste"); }
  }
  return <Glass blur className={lab.card}>
    <div className={lab.cardHead}><h2 className={`${lab.cardTitle} serif`}>AI</h2><span className={lab.cardMeta}>Gemini</span></div>
    <div className={lab.reminderRow}>
      <span className={lab.reminderIcon}><Sparkles aria-hidden="true"/></span>
      <div className={lab.reminderText}><p>{apiKey ? "Connected" : "Add your Gemini key"}</p><p className={lab.hint}>{apiKey ? `Key ending in ${apiKey.slice(-4)}. Voice notes, questions and payslips use it.` : "One key does voice notes, questions and payslip checks."}</p></div>
    </div>
    {apiKey
      ? <div className={lab.inline}><Button variant="quiet" size="small" onClick={() => { onSave(""); say("Key removed from this phone"); }}>Remove key</Button></div>
      : <>
        <input className={styles.input} type="password" autoComplete="off" spellCheck={false} placeholder="Paste key (starts with AIza…)" value={text} onChange={event => setText(event.target.value)} aria-label="Gemini API key"/>
        <div className={lab.inline}>
          <Button variant="glass" size="small" icon={<ClipboardPaste/>} onClick={() => void paste()} disabled={busy}>Paste</Button>
          <Button variant="primary" size="small" icon={<KeyRound/>} onClick={() => void save()} disabled={busy || !text.trim()}>{busy ? "Checking…" : "Save key"}</Button>
        </div>
        <p className={lab.hint}>Get a free key at <a className={styles.link} href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. It stays on this phone.</p>
      </>}
  </Glass>;
}

const SUGGESTIONS = ["How much did I work last week?", "What have I earned this month?", "Which day was my longest?"];

/** Week tab: ask about your hours by typing or talking. */
export function AskCard({ apiKey, context, say, onNeedKey }: { apiKey: string; context: () => string; say: (text: string) => void; onNeedKey: () => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask(value = question) {
    const q = value.trim();
    if (!q) return;
    if (!apiKey) { onNeedKey(); return; }
    setBusy(true);
    try { const { answer: a } = await callAi<{ answer: string }>({ task: "ask", key: apiKey, question: q, context: context() }); setAnswer({ q, a }); setQuestion(""); }
    catch (error) { say(error instanceof Error ? error.message : "Couldn't get an answer"); }
    finally { setBusy(false); }
  }
  const voice = useVoice({ apiKey, onText: text => { setQuestion(text); void ask(text); }, onError: message => message.startsWith("Paste your Gemini key") ? onNeedKey() : say(message) });
  return <Glass blur className={lab.card}>
    <div className={lab.cardHead}><h2 className={`${lab.cardTitle} serif`}>Ask your hours</h2><span className={lab.cardMeta}>Type or talk</span></div>
    <form className={styles.askRow} onSubmit={event => { event.preventDefault(); void ask(); }}>
      <input className={styles.input} value={question} onChange={event => setQuestion(event.target.value)} placeholder="How much did I work in October?" aria-label="Question about your hours" enterKeyHint="send"/>
      {question.trim()
        ? <m.button type="submit" className={styles.send} aria-label="Ask" disabled={busy} whileTap={{ scale: 0.92 }} transition={spring.tap}><ArrowUp aria-hidden="true"/></m.button>
        : <MicPill state={busy ? "writing" : voice.mic} level={voice.level} seconds={voice.seconds} onToggle={voice.toggle} label="Ask by voice"/>}
    </form>
    <AnimatePresence mode="popLayout" initial={false}>
      {busy && !answer && <m.p key="thinking" className={lab.hint} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Thinking…</m.p>}
      {answer && <m.div key={answer.q} className={styles.answer} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={spring.settle}>
        <p className={styles.asked}>{answer.q}</p>
        <p>{answer.a}</p>
      </m.div>}
    </AnimatePresence>
    {!answer && <div className={styles.chips}>{SUGGESTIONS.map(s => <button key={s} type="button" className={styles.chip} onClick={() => void ask(s)} disabled={busy}>{s}</button>)}</div>}
  </Glass>;
}

export type Logged = { minutes: number; from: string | null };
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const niceDate = (iso: string) => dayFormat.format(new Date(`${iso}T12:00:00`));
const krFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });

/** Week tab: photograph the payslip; Gemini reads the hours and pay, the app compares them with what you logged. */
export function PayslipCard({ apiKey, logged, say, onNeedKey }: { apiKey: string; logged: (from: string, to: string) => Logged; say: (text: string) => void; onNeedKey: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Payslip | null>(null);
  async function check(file: File | undefined) {
    if (!file) return;
    setBusy(true); setResult(null);
    try { const { payslip } = await callAi<{ payslip: Payslip }>({ task: "payslip", key: apiKey, image: await photo(file) }); setResult(payslip); }
    catch (error) { say(error instanceof Error ? error.message : "Couldn't read the payslip"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  let verdict: { tone: "ok" | "short" | "extra" | "unknown"; text: string } | null = null;
  let mine: Logged | null = null;
  if (result?.periodStart && result.periodEnd && result.hours !== null) {
    mine = logged(result.periodStart, result.periodEnd);
    const gap = mine.minutes - Math.round(result.hours * 60);
    const rate = result.hourlyRate ?? RATE;
    verdict = Math.abs(gap) <= 15 ? { tone: "ok", text: "Matches what you logged." }
      : gap > 0 ? { tone: "short", text: `${hm(gap)} missing on the payslip. That's about ${krFormat.format(Math.round(gap / 60 * rate))} kr before tax. Worth asking about.` }
      : { tone: "extra", text: `The payslip has ${hm(-gap)} more than you logged. Maybe a shift you didn't track.` };
  } else if (result) verdict = { tone: "unknown", text: "Couldn't read the period or hours clearly. Try a sharper photo of the whole page." };

  return <Glass blur className={lab.card}>
    <div className={lab.cardHead}><h2 className={`${lab.cardTitle} serif`}>Payslip check</h2><span className={lab.cardMeta}>Photo</span></div>
    <input ref={input} type="file" accept="image/*" hidden onChange={event => void check(event.target.files?.[0])} aria-label="Payslip photo"/>
    <AnimatePresence mode="popLayout" initial={false}>
      {result && <m.div key="result" className={styles.payslip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.settle}>
        <div className={styles.compare}>
          <div><p className={lab.statLabel}>Payslip</p><p className={`${styles.compareBig} numeric`}>{result.hours !== null ? hm(Math.round(result.hours * 60)) : "?"}</p>
            <p className={lab.hint}>{result.periodStart && result.periodEnd ? `${niceDate(result.periodStart)} – ${niceDate(result.periodEnd)}` : "Period unclear"}</p>
            {result.grossPay ? <p className={lab.hint}>{krFormat.format(result.grossPay)} kr gross</p> : null}</div>
          <div><p className={lab.statLabel}>You logged</p><p className={`${styles.compareBig} numeric`}>{mine ? hm(mine.minutes) : "?"}</p>
            <p className={lab.hint}>{mine?.from && result.periodStart && mine.from > result.periodStart ? `Only from ${niceDate(mine.from)}` : "Same period"}</p></div>
        </div>
        {verdict && <p className={`${styles.verdict} ${styles[verdict.tone]}`}>{verdict.text}</p>}
      </m.div>}
    </AnimatePresence>
    {!result && <p className={lab.hint}>Take a photo of your lønseddel. Gemini reads the hours and pay, and you see if anything is missing.</p>}
    <Button variant={result ? "glass" : "primary"} icon={<Camera/>} onClick={() => apiKey ? input.current?.click() : onNeedKey()} disabled={busy}>{busy ? "Reading the payslip…" : result ? "Check another" : "Check a payslip"}</Button>
  </Glass>;
}
