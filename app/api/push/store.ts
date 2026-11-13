import { get, put } from "@vercel/blob";
import * as webpush from "web-push";
import type { Device, ReminderAction } from "./schedule";

export * from "./schedule";

/**
 * Shift reminders: the phones that asked for them, and what to send when.
 * Kept in one private Vercel Blob file. Only the push address and the reminder times are stored,
 * never shifts or hours (those stay on the phone).
 */
type State = { devices: Device[] };

const FILE = "push/devices.json";
const MAX_DEVICES = 5;

export function configured() {
  return { push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), store: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) };
}

let vapidReady = false;
function vapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://route-hours.vercel.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  vapidReady = true;
}

export async function readState(): Promise<State> {
  try {
    const result = await get(FILE, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { devices: [] };
    const parsed = JSON.parse(await new Response(result.stream).text()) as State;
    return Array.isArray(parsed?.devices) ? parsed : { devices: [] };
  } catch (error) {
    if (error instanceof Error && /not.?found/i.test(error.name + error.message)) return { devices: [] };
    throw error;
  }
}

export async function writeState(state: State) {
  state.devices = state.devices.slice(-MAX_DEVICES);
  await put(FILE, JSON.stringify(state), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
}

export type Payload = { title: string; body: string; tag: string; action?: ReminderAction };

/** Sends one notification. Returns "gone" when the phone has unsubscribed, so the caller can forget it. */
export async function send(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: Payload): Promise<"ok" | "gone" | "error"> {
  vapid();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 30 * 60, urgency: "high" });
    return "ok";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
}
