import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 3_000_000;
const AUDIO_TYPES = new Set(["audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg"]);

function reply(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function keyFrom(request: NextRequest) {
  const key = request.headers.get("x-groq-api-key")?.trim() || "";
  return key.length <= 256 ? key : "";
}

function groqError(status: number) {
  if (status === 401 || status === 403) return "Groq rejected this API key or its model permissions. Check the key in Groq Console.";
  if (status === 413) return "This recording is too large. Try a shorter note.";
  if (status === 429) return "Groq's usage limit has been reached. Try again later.";
  if (status === 400 || status === 422) return "Groq could not read this recording. Try speaking again.";
  return `Groq is unavailable (${status}). Try again later.`;
}

export async function GET(request: NextRequest) {
  const key = keyFrom(request);
  if (!key) return reply({ error: "Add a Groq API key in Settings first." }, 401);
  try {
    const response = await fetch(`https://api.groq.com/openai/v1/models/${MODEL}`, {
      headers: { authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return reply({ error: groqError(response.status) }, 502);
    return reply({ ready: true });
  } catch {
    return reply({ error: "Could not reach Groq. Check your connection and try again." }, 502);
  }
}

export async function POST(request: NextRequest) {
  const key = keyFrom(request);
  if (!key) return reply({ error: "Add a Groq API key in Settings first." }, 401);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_AUDIO_BYTES + 100_000) return reply({ error: "Recording is too large. Keep it under one minute." }, 413);

  let data: FormData;
  try { data = await request.formData(); }
  catch { return reply({ error: "Invalid audio upload." }, 400); }
  const audio = data.get("audio");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || !AUDIO_TYPES.has(audio.type.split(";")[0])) {
    return reply({ error: "Unsupported recording. Use a short audio clip from the microphone." }, 400);
  }
  const language = data.get("language");
  const upload = new FormData();
  upload.append("file", audio, audio.name);
  upload.append("model", MODEL);
  upload.append("response_format", "json");
  if (language === "en" || language === "da" || language === "ar") upload.append("language", language);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: upload,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return reply({ error: groqError(response.status) }, 502);
    const result: unknown = await response.json();
    const text = result && typeof result === "object" && "text" in result && typeof result.text === "string" ? result.text.trim() : "";
    if (!text) return reply({ error: "No speech was detected. Try again closer to the microphone." }, 422);
    return reply({ text: text.slice(0, 3000) });
  } catch {
    return reply({ error: "Transcription could not finish. Your recording was not saved; please try again." }, 502);
  }
}
