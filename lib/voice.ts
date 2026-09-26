export type VoiceIntent =
  | { kind: "start" | "stop" }
  | { kind: "logHours"; hours: number }
  | { kind: "help"; question: string }
  | { kind: "note"; text: string };

export function interpretVoice(transcript: string): VoiceIntent {
  const phrase = transcript.trim();
  if (/^(please )?(start|begin)( my| the)? shift\b/i.test(phrase)) return { kind: "start" };
  if (/^(please )?(stop|end|finish)( my| the)? shift\b/i.test(phrase)) return { kind: "stop" };
  const hours = phrase.match(/^(?:i\s+)?(?:worked|did|log|add)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hours) return { kind: "logHours", hours: Number(hours[1]) };
  if (/^(how|what|where|why|which|can you|could you|help me|tell me|explain|hvordan|hvad|hvor|kan du|hjælp mig|كيف|ماذا|أين|هل يمكنك)\b/i.test(phrase) || /\?$/.test(phrase)) return { kind: "help", question: phrase };
  return { kind: "note", text: phrase.replace(/^(add|take|write)( a)? note[:,]?\s*/i, "").trim() };
}
