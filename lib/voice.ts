export type VoiceIntent =
  | { kind: "start" | "stop" }
  | { kind: "logHours"; hours: number }
  | { kind: "note"; text: string };

export function interpretVoice(transcript: string): VoiceIntent {
  const phrase = transcript.trim();
  if (/^(please )?(start|begin)( my| the)? shift\b/i.test(phrase)) return { kind: "start" };
  if (/^(please )?(stop|end|finish)( my| the)? shift\b/i.test(phrase)) return { kind: "stop" };
  const hours = phrase.match(/^(?:i\s+)?(?:worked|did|log|add)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hours) return { kind: "logHours", hours: Number(hours[1]) };
  return { kind: "note", text: phrase.replace(/^(add|take|write)( a)? note[:,]?\s*/i, "").trim() };
}
