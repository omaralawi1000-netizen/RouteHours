import { createHash } from "node:crypto";
import { BlobNotFoundError, BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";
import * as webpush from "web-push";
import type { Device, ReminderAction } from "./schedule";

export * from "./schedule";

/**
 * Shift reminders: the phones that asked for them, and what to send when.
 * Each phone is its own private Vercel Blob file, so two phones (or a phone and the timer) never
 * overwrite each other. Only the push address and the reminder times are stored, never shifts or hours.
 */
const DIR = "push/devices/";
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

const fileFor = (endpoint: string) => `${DIR}${createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}.json`;

export type Stored = { device: Device; pathname: string; etag: string };

async function read(pathname: string): Promise<Stored | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const device = JSON.parse(await new Response(result.stream).text()) as Device;
    return device?.endpoint ? { device, pathname, etag: result.blob.etag } : null;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

/** Every stored phone, oldest first. */
export async function readDevices(): Promise<Stored[]> {
  const { blobs } = await list({ prefix: DIR, limit: 50 });
  const found = await Promise.all(blobs.sort((a, b) => +a.uploadedAt - +b.uploadedAt).map(blob => read(blob.pathname)));
  return found.filter((x): x is Stored => !!x);
}

export async function readDevice(endpoint: string) { return read(fileFor(endpoint)); }

/**
 * Saves one phone. With an etag, only if nobody changed it since it was read. Returns the new etag,
 * or null if someone else wrote it first.
 */
export async function writeDevice(device: Device, etag?: string): Promise<string | null> {
  try {
    const saved = await put(fileFor(device.endpoint), JSON.stringify(device), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60, ...(etag ? { ifMatch: etag } : {}) });
    return saved.etag;
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return null;
    throw error;
  }
}

export async function removeDevice(endpoint: string) { await del(fileFor(endpoint)); }

/**
 * True when there is no room for another phone. A full list refuses newcomers instead of dropping
 * the oldest, so nobody can push a working phone out by registering made-up ones.
 */
export async function devicesFull() {
  const { blobs } = await list({ prefix: DIR, limit: MAX_DEVICES + 1 });
  return blobs.length >= MAX_DEVICES;
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
