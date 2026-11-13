/** Input checks for the Gemini endpoint, kept pure so they can be tested without the network. */

export type Media = { type: string; data: string };
export type AiTask =
  | { task: "test"; key: string }
  | { task: "listen"; key: string; audio: Media }
  | { task: "ask"; key: string; question: string; context: string }
  | { task: "payslip"; key: string; image: Media };

export type Payslip = { periodStart: string | null; periodEnd: string | null; hours: number | null; hourlyRate: number | null; grossPay: number | null };

const AUDIO = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"]);
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Base64 grows by a third; 3.6 MB of text stays under Vercel's 4.5 MB request limit. */
const MAX_MEDIA = 3_600_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function media(value: unknown, allowed: Set<string>): Media | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { type?: unknown; data?: unknown };
  const type = typeof v.type === "string" ? v.type.split(";")[0].trim().toLowerCase() : "";
  if (!allowed.has(type) || typeof v.data !== "string" || !v.data || v.data.length > MAX_MEDIA || !BASE64.test(v.data)) return null;
  return { type, data: v.data };
}

export function checkTask(value: unknown): AiTask | { error: string } {
  if (!value || typeof value !== "object") return { error: "That request didn't come through. Try again." };
  const v = value as Record<string, unknown>;
  const key = typeof v.key === "string" ? v.key.trim() : "";
  if (!key) return { error: "Paste your Gemini key in Lab first." };
  if (key.length > 256 || /\s/.test(key)) return { error: "That doesn't look like a Gemini key." };
  switch (v.task) {
    case "test": return { task: "test", key };
    case "listen": {
      const audio = media(v.audio, AUDIO);
      return audio ? { task: "listen", key, audio } : { error: "That recording couldn't be read. Keep it under a minute and try again." };
    }
    case "ask": {
      const question = typeof v.question === "string" ? v.question.trim() : "";
      const context = typeof v.context === "string" ? v.context.trim() : "";
      if (!question) return { error: "Ask something first." };
      if (question.length > 500 || context.length > 6000) return { error: "Keep the question short." };
      return { task: "ask", key, question, context };
    }
    case "payslip": {
      const image = media(v.image, IMAGE);
      return image ? { task: "payslip", key, image } : { error: "Use a photo (JPG or PNG) of the payslip." };
    }
    default: return { error: "Unknown request." };
  }
}

const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const amount = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) && value > 0 && value < max ? value : null;

/** Gemini's JSON answer, checked. Null when it isn't a payslip or nothing useful was read. */
export function payslipFrom(text: string): Payslip | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (v.isPayslip === false) return null;
  const payslip = { periodStart: date(v.periodStart), periodEnd: date(v.periodEnd), hours: amount(v.hours, 400), hourlyRate: amount(v.hourlyRate, 2000), grossPay: amount(v.grossPay, 500_000) };
  return payslip.hours === null && payslip.grossPay === null ? null : payslip;
}
