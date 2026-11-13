"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DictationLanguage } from "@/lib/stored-data";

type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
/** Where the dictated words go: the shift note or the Ask box. */
export type DictationTarget = "general" | "assistant";

type Options = {
  groqKey: string;
  language: DictationLanguage;
  /** Called with what was heard and where it was meant to go. */
  onTranscript: (text: string, target: DictationTarget) => void;
  onNotice: (message: string) => void;
  /** Called when the microphone starts listening. */
  onStart?: () => void;
};

/**
 * Microphone dictation. With a Groq key it records up to a minute and sends the audio
 * to /api/transcribe; without one it uses the browser's own speech recognition.
 */
export function useDictation({ groqKey, language, onTranscript, onNotice, onStart }: Options) {
  const latest = useRef({ groqKey, language, onTranscript, onNotice, onStart });
  latest.current = { groqKey, language, onTranscript, onNotice, onStart };
  const recognition = useRef<Recognition | null>(null);
  const voiceTarget = useRef<DictationTarget>("general");
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderStream = useRef<MediaStream | null>(null);
  const recordingClock = useRef<number | null>(null);
  const recordingLimit = useRef<number | null>(null);
  const recordingStarted = useRef(0);
  const recordingCancelled = useRef(false);
  const recordedChunks = useRef<Blob[]>([]);
  const audioMeter = useRef<AudioContext | null>(null);
  const meterFrame = useRef<number | null>(null);
  const micStartingRef = useRef(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const notice = (message: string) => latest.current.onNotice(message);
  function deliver(text: string) {
    const target = voiceTarget.current;
    if (target === "assistant") voiceTarget.current = "general";
    latest.current.onTranscript(text, target);
  }
  function stopMeter() {
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    if (audioMeter.current) void audioMeter.current.close().catch(() => {});
    audioMeter.current = null;
    setAudioLevel(0);
  }
  function startMeter(stream: MediaStream) {
    try {
      const context = new AudioContext(); audioMeter.current = context;
      void context.resume().catch(() => {});
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (now: number) => {
        if (now - last > 60) {
          analyser.getByteTimeDomainData(buffer);
          const rms = Math.sqrt(buffer.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / buffer.length);
          setAudioLevel(Math.min(1, rms * 7)); last = now;
        }
        meterFrame.current = requestAnimationFrame(tick);
      };
      meterFrame.current = requestAnimationFrame(tick);
    } catch { /* Dictation still works when the optional meter is unavailable. */ }
  }
  function startListening() {
    const speechWindow = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) { notice("Voice input is unavailable in this browser. You can still type notes and use the timer."); return; }
    latest.current.onStart?.();
    const instance = new Speech();
    const lang = latest.current.language;
    instance.lang = lang === "da" ? "da-DK" : lang === "ar" ? "ar-SA" : "en-US";
    instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => deliver(event.results[0]?.[0]?.transcript || "");
    instance.onerror = event => {
      voiceTarget.current = "general";
      setListening(false);
      notice(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was blocked. Allow microphone access in your browser settings."
        : event.error === "no-speech" ? "I didn't hear anything. Tap the microphone and try again."
          : event.error === "network" ? "Speech recognition needs a connection in this browser. Try again online."
            : "Could not capture speech. Check microphone permission and try again.");
    };
    instance.onend = () => { setListening(false); voiceTarget.current = "general"; };
    recognition.current = instance;
    try { instance.start(); setListening(true); } catch { setListening(false); notice("Microphone could not start."); }
  }
  function releaseRecording() {
    stopMeter();
    if (recordingClock.current !== null) window.clearInterval(recordingClock.current);
    if (recordingLimit.current !== null) window.clearTimeout(recordingLimit.current);
    recordingClock.current = null; recordingLimit.current = null;
    recorderStream.current?.getTracks().forEach(track => track.stop());
    recorderStream.current = null; recorder.current = null;
    setRecording(false);
  }
  async function transcribeRecording(blob: Blob, mimeType: string, key: string, lang: DictationLanguage) {
    if (!blob.size || blob.size > 3_000_000) {
      voiceTarget.current = "general";
      setTranscribing(false);
      notice(blob.size ? "Recording is too large. Try a shorter note." : "No audio was recorded. Try again.");
      return;
    }
    const type = mimeType.split(";")[0];
    const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("audio", new File([blob], `routehours-dictation.${extension}`, { type }));
    if (lang !== "auto") form.append("language", lang);
    try {
      const response = await fetch("/api/transcribe", { method: "POST", headers: { "x-groq-api-key": key }, body: form });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.text !== "string") throw new Error(result?.error || "Groq did not return text. Try again.");
      deliver(result.text);
    } catch (error) {
      voiceTarget.current = "general";
      notice(error instanceof TypeError ? "Could not reach Groq. Check your connection and try again." : error instanceof Error ? error.message : "Could not transcribe. Try again online.");
    } finally { setTranscribing(false); }
  }
  function stopGroqRecording() {
    const instance = recorder.current;
    if (!instance || instance.state !== "recording") return;
    setRecording(false); setTranscribing(true);
    try { instance.stop(); }
    catch { releaseRecording(); setTranscribing(false); notice("Recording could not stop. Try again."); }
  }
  async function startGroqRecording() {
    if (micStartingRef.current || recording || transcribing) return;
    if (!navigator.onLine) { notice("Groq dictation needs an internet connection. You can still type a note."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notice("Audio recording is unavailable in this browser. Trying browser voice input instead.");
      startListening();
      return;
    }
    micStartingRef.current = true; setMicStarting(true);
    recordingCancelled.current = false;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (recordingCancelled.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const key = latest.current.groqKey.trim();
      const lang = latest.current.language;
      recorder.current = instance; recorderStream.current = stream; recordedChunks.current = []; recordingCancelled.current = false;
      instance.ondataavailable = event => { if (event.data.size) recordedChunks.current.push(event.data); };
      instance.onerror = () => {
        recordingCancelled.current = true;
        notice("Recording failed. Check microphone access and try again.");
        if (instance.state === "recording") stopGroqRecording();
        else { releaseRecording(); setTranscribing(false); }
      };
      instance.onstop = () => {
        const type = instance.mimeType || mimeType || "audio/webm";
        const audio = new Blob(recordedChunks.current, { type });
        recordedChunks.current = [];
        releaseRecording();
        if (recordingCancelled.current) { setTranscribing(false); return; }
        void transcribeRecording(audio, type, key, lang);
      };
      latest.current.onStart?.(); setRecordSeconds(0);
      instance.start(); setRecording(true);
      startMeter(stream);
      recordingStarted.current = Date.now();
      recordingClock.current = window.setInterval(() => setRecordSeconds(Math.floor((Date.now() - recordingStarted.current) / 1000)), 500);
      recordingLimit.current = window.setTimeout(() => { notice("One minute recorded. Sending it to Groq now."); stopGroqRecording(); }, 60_000);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      releaseRecording();
      notice("Microphone could not start. Allow microphone access in your browser settings.");
    } finally { micStartingRef.current = false; setMicStarting(false); }
  }
  /** Start or stop dictation for one target. Ignored while the mic is busy with the other target. */
  function toggle(target: DictationTarget) {
    if (voiceTarget.current === target && recording) { stopGroqRecording(); return; }
    if (voiceTarget.current === target && listening) { recognition.current?.stop(); setListening(false); return; }
    if (recording || listening || transcribing || micStarting) return;
    voiceTarget.current = target;
    if (latest.current.groqKey.trim()) void startGroqRecording(); else startListening();
  }

  const cleanup = useCallback(() => {
    recordingCancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorderStream.current?.getTracks().forEach(track => track.stop());
    if (recordingClock.current) window.clearInterval(recordingClock.current);
    if (recordingLimit.current) window.clearTimeout(recordingLimit.current);
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current);
    if (audioMeter.current) void audioMeter.current.close().catch(() => {});
    recognition.current?.stop();
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const active = recording || listening;
  return {
    recording, listening, micStarting, transcribing, audioLevel, recordSeconds,
    /** Where the current or last dictation was aimed. */
    target: voiceTarget.current,
    /** True while the mic is recording or listening for `target`. */
    isActiveFor: (target: DictationTarget) => voiceTarget.current === target && active,
    /** True while anything voice-related is happening. */
    busy: active || transcribing || micStarting,
    toggle,
  };
}
export type Dictation = ReturnType<typeof useDictation>;
