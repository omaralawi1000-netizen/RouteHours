"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Footprints, Send } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
import SegmentedControl from "../ui/segmented-control";
import Toggle from "../ui/toggle";
import { DAY_PARTS } from "./today";
import styles from "./lab.module.css";

/** What gets sent, Monday to Friday, Copenhagen time. Built from the usual split day. */
const [MORNING, AFTERNOON] = DAY_PARTS;
const minus = (time: string, minutes: number) => { const [h, m] = time.split(":").map(Number), t = h * 60 + m - minutes; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
export const REMINDERS = [
  { id: "morning-start", time: minus(MORNING.start, 5), action: "start", title: `Morning shift at ${MORNING.start}`, body: "Tap Start shift when you pull out." },
  { id: "morning-end", time: MORNING.end, action: "finish", title: "End of the morning run?", body: `Usually done at ${MORNING.end}. Tap Finish shift.` },
  { id: "afternoon-start", time: minus(AFTERNOON.start, 5), action: "start", title: `Afternoon shift at ${AFTERNOON.start}`, body: "Tap Start shift when you pull out." },
  { id: "afternoon-end", time: AFTERNOON.end, action: "finish", title: "End of the afternoon run?", body: `Usually done at ${AFTERNOON.end}. Tap Finish shift.` },
] as const;
type Reminder = { id: string; time: string; action: "start" | "finish" | "leave"; title: string; body: string };

/** "Leave now": minutes before each usual start. Zero means off. */
export const TRAVEL_OPTIONS = [0, 15, 20, 30, 45] as const;
export type Travel = (typeof TRAVEL_OPTIONS)[number];
const TRAVEL_KEY = "routehours:lab-travel";
export function leaveAt(start: string, travel: number) { return minus(start, travel); }

/** The full list for a given trip length: the leave nudges slot in before each start. */
export function remindersFor(travel: number): Reminder[] {
  const leave: Reminder[] = travel ? [MORNING, AFTERNOON].map(part => ({ id: `${part.id}-leave`, time: leaveAt(part.start, travel), action: "leave", title: `Leave for the ${part.label.toLowerCase()} shift`, body: `It starts at ${part.start}. About ${travel} min to get there.` })) : [];
  return [...leave, ...REMINDERS].sort((a, b) => a.time.localeCompare(b.time));
}

export function useTravel(): [Travel, (next: Travel) => void] {
  const [travel, setTravel] = useState<Travel>(20);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(TRAVEL_KEY)); if (localStorage.getItem(TRAVEL_KEY) !== null && (TRAVEL_OPTIONS as readonly number[]).includes(saved)) setTravel(saved as Travel); } catch { /* default */ }
  }, []);
  return [travel, next => { setTravel(next); try { localStorage.setItem(TRAVEL_KEY, String(next)); } catch { /* kept for this visit */ } }];
}
const KEY = "routehours:lab-reminders";

type Server = { publicKey: string | null; push: boolean; store: boolean };
type State = "unsupported" | "off" | "on" | "busy";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** Lock-screen reminders with Start and Finish buttons, so the shift is one tap away even with the app closed. */
export default function Reminders({ say, travel, onTravel }: { say: (text: string) => void; travel: Travel; onTravel: (next: Travel) => void }) {
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
        const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), reminders: remindersFor(travel), days: [1, 2, 3, 4, 5] }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the reminders.");
        say("Reminders on, Monday to Friday");
      } else say("This phone is ready. Daily reminders start once storage is set up.");
      try { localStorage.setItem(KEY, "on"); } catch { /* still on for now */ }
      setState("on");
    } catch (error) { setState("off"); say(error instanceof Error ? error.message : "Couldn't turn reminders on"); }
  }

  // A new trip length re-saves this phone's list, so the server sends the new leave time.
  const synced = useRef(travel);
  useEffect(() => {
    if (synced.current === travel || state !== "on" || !server?.store) return;
    synced.current = travel;
    subscription(false).then(sub => sub && fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), reminders: remindersFor(travel), days: [1, 2, 3, 4, 5] }) }))
      .then(res => { if (res && !res.ok) say("Couldn't update the leave time on the server"); }).catch(() => say("Couldn't update the leave time on the server"));
  }, [travel, state, server]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <SegmentedControl label="Time to get there" value={String(travel)} onChange={v => onTravel(Number(v) as Travel)} options={TRAVEL_OPTIONS.map(t => ({ value: String(t), label: t ? String(t) : "Off" }))}/>
    <ul className={styles.reminderList}>
      {remindersFor(travel).map(r => <li key={r.id}><span className="numeric">{r.time}</span><span>{r.title}</span><span className={styles.reminderTag}>{r.action === "start" ? "Start" : r.action === "leave" ? "Leave" : "Finish"}</span></li>)}
    </ul>
    <Button variant="glass" size="small" icon={<Send/>} onClick={test} disabled={state !== "on"}>Send a test now</Button>
  </Glass>;
}
