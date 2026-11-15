"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Footprints, Send } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
import SegmentedControl from "../ui/segmented-control";
import Toggle from "../ui/toggle";
import { minutesToClock, toMinutes, type DayPart } from "./usual";
import styles from "./home.module.css";

type Reminder = { id: string; time: string; action: "start" | "finish" | "leave"; title: string; body: string; day?: 1 | -1 };
const minus = (time: string, minutes: number) => minutesToClock(toMinutes(time) - minutes);
/** -1 when the reminder falls on the evening before the shift's day (a 00:10 start, say). */
const before = (time: string, minutes: number) => toMinutes(time) < minutes ? { day: -1 as const } : {};

/** "Leave now": minutes before each usual start. Zero means off. */
export const TRAVEL_OPTIONS = [0, 15, 20, 30, 45] as const;
export const TRAVEL_KEY = "routehours:travel";
export const LEGACY_TRAVEL_KEY = "routehours:lab-travel";
export const isTravel = (v: unknown): v is number => typeof v === "number" && (TRAVEL_OPTIONS as readonly number[]).includes(v);

/** What gets sent, Monday to Friday, in the work time zone: a nudge before each usual start and a check at each usual end. */
export function remindersFor(parts: DayPart[], travel: number): Reminder[] {
  const list: Reminder[] = parts.flatMap(part => [
    { id: `${part.id}-start`, time: minus(part.start, 5), action: "start" as const, title: `${part.label} shift at ${part.start}`, body: "Tap Start shift when you pull out.", ...before(part.start, 5) },
    // An overnight part (22:00–06:00) ends on the next day.
    { id: `${part.id}-end`, time: part.end, action: "finish" as const, title: `End of the ${part.label.toLowerCase()} run?`, body: `Usually done at ${part.end}. Tap Finish shift.`, ...(toMinutes(part.start) + part.minutes >= 1440 ? { day: 1 as const } : {}) },
    ...(travel ? [{ id: `${part.id}-leave`, time: minus(part.start, travel), action: "leave" as const, title: `Leave for the ${part.label.toLowerCase()} shift`, body: `It starts at ${part.start}. About ${travel} min to get there.`, ...before(part.start, travel) }] : []),
  ]);
  return list.sort((a, b) => a.time.localeCompare(b.time));
}

/** The reminder list this phone last sent to the server. */
const SYNC_KEY = "routehours:reminders-synced";
function readSynced() { try { return localStorage.getItem(SYNC_KEY) ?? ""; } catch { return ""; } }
function writeSynced(list: string) { try { localStorage.setItem(SYNC_KEY, list); } catch { /* sent again next time */ } }
/** Kept from the lab, so a phone that already turned reminders on stays on. */
const KEY = "routehours:lab-reminders";

type Server = { publicKey: string | null; push: boolean; store: boolean };
type State = "unsupported" | "off" | "on" | "busy";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** Lock-screen reminders with Start and Finish buttons, so the shift is one tap away even with the app closed. */
export default function Reminders({ say, travel, onTravel, parts, zone }: { say: (text: string) => void; travel: number; onTravel: (next: number) => void; parts: DayPart[]; zone: string }) {
  const [server, setServer] = useState<Server | null>(null);
  const [state, setState] = useState<State>("off");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    fetch("/api/push/key").then(r => r.json()).then(setServer).catch(() => setServer({ publicKey: null, push: false, store: false }));
    navigator.serviceWorker.getRegistration().then(reg => reg?.pushManager.getSubscription()).then(sub => { if (sub && localStorage.getItem(KEY) === "on") setState("on"); }).catch(() => {});
  }, []);

  async function subscription(create: boolean) {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready);
    const existing = await reg.pushManager.getSubscription();
    if (existing || !create) return existing;
    if (!server?.publicKey) throw new Error("The server has no push key yet.");
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server.publicKey) });
  }

  async function turnOn() {
    setState("busy");
    try {
      if (await Notification.requestPermission() !== "granted") { setState("off"); say("Notifications are blocked. Allow them in Chrome's site settings."); return; }
      const sub = await subscription(true);
      if (!sub) throw new Error("No subscription");
      if (server?.store) {
        const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), reminders: remindersFor(parts, travel), days: [1, 2, 3, 4, 5], zone }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the reminders.");
        writeSynced(list); synced.current = list;
        say("Reminders on, Monday to Friday");
      } else say("This phone is ready. Daily reminders start once storage is set up.");
      try { localStorage.setItem(KEY, "on"); } catch { /* still on for now */ }
      setState("on");
    } catch (error) { setState("off"); say(error instanceof Error ? error.message : "Couldn't turn reminders on"); }
  }

  // The server keeps this phone's list. Whenever the list here differs from the one last sent (a new
  // trip length, new usual shifts or zone, also changed from the classic screens), it is sent again.
  const list = JSON.stringify([remindersFor(parts, travel), zone]);
  // One send at a time: when it's done, the newest list goes next, so an older list never lands last.
  const synced = useRef<string | null>(null);
  if (synced.current === null) synced.current = readSynced();
  const inFlight = useRef(false);
  const failed = useRef("");
  const sync = useRef<() => void>(() => {});
  useEffect(() => {
    sync.current = () => {
      if (inFlight.current || synced.current === list || failed.current === list || state !== "on" || !server?.store) return;
      inFlight.current = true;
      const sending = list;
      subscription(false).then(sub => sub && fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), reminders: remindersFor(parts, travel), days: [1, 2, 3, 4, 5], zone }) }))
        .then(res => { if (res && !res.ok) throw new Error(); if (res) { synced.current = sending; writeSynced(sending); } })
        .catch(() => { failed.current = sending; say("Couldn't update the reminder times on the server"); })
        .finally(() => { inFlight.current = false; sync.current(); });
    };
    sync.current();
  }, [list, state, server]); // eslint-disable-line react-hooks/exhaustive-deps

  async function turnOff() {
    setState("busy");
    try {
      const sub = await subscription(false);
      if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
      try { localStorage.removeItem(KEY); } catch { /* fine */ }
      say("Reminders off");
    } finally { setState("off"); }
  }

  async function test() {
    try {
      const sub = await subscription(false);
      if (!sub) { say("Turn reminders on first"); return; }
      const res = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      say(res.ok ? "Sent. Lock your phone and look." : (await res.json().catch(() => ({}))).error ?? "Couldn't send the test");
    } catch { say("Couldn't send the test"); }
  }

  const ready = server?.push;
  const hint = state === "unsupported" ? "This browser can't show reminders. Use Chrome, added to the home screen."
    : server && !ready ? "Almost there: the server keys aren't set up yet."
    : state === "on" ? (server?.store ? "On, Monday to Friday" : "This phone is ready. Daily sending needs storage.") : "Start and Finish right on your lock screen";

  return <Glass blur className={styles.card}>
    <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Shift reminders</h2><span className={styles.cardMeta}>Mon–Fri</span></div>
    <div className={styles.reminderRow}>
      <span className={styles.reminderIcon}><BellRing aria-hidden="true"/></span>
      <div className={styles.reminderText}><p>Remind me</p><p className={styles.hint}>{hint}</p></div>
      <Toggle label="Shift reminders" checked={state === "on"} onChange={on => { if (state === "busy" || state === "unsupported" || !ready) return; if (on) turnOn(); else turnOff(); }}/>
    </div>
    <div className={styles.reminderRow}>
      <span className={styles.reminderIcon}><Footprints aria-hidden="true"/></span>
      <div className={styles.reminderText}><p>Leave now</p><p className={styles.hint}>{travel ? `Minutes to get there. Nudges you ${travel} min before each start.` : "Off. No nudge to head out."}</p></div>
    </div>
    <SegmentedControl label="Time to get there" value={String(travel)} onChange={v => onTravel(Number(v))} options={TRAVEL_OPTIONS.map(t => ({ value: String(t), label: t ? String(t) : "Off" }))}/>
    <ul className={styles.reminderList}>
      {remindersFor(parts, travel).map(r => <li key={r.id}><span className="numeric">{r.time}</span><span>{r.title}</span><span className={styles.reminderTag}>{r.action === "start" ? "Start" : r.action === "leave" ? "Leave" : "Finish"}</span></li>)}
    </ul>
    <Button variant="glass" size="small" icon={<Send/>} onClick={test} disabled={state !== "on"}>Send a test now</Button>
  </Glass>;
}
