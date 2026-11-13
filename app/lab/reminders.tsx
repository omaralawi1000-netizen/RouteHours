"use client";

import { useEffect, useState } from "react";
import { BellRing, Send } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
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
] as const;
const KEY = "routehours:lab-reminders";

type Server = { publicKey: string | null; push: boolean; store: boolean };
type State = "unsupported" | "off" | "on" | "busy";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** Lock-screen reminders with Start and Finish buttons, so the shift is one tap away even with the app closed. */
export default function Reminders({ say }: { say: (text: string) => void }) {
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
        const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), reminders: REMINDERS, days: [1, 2, 3, 4, 5] }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the reminders.");
        say("Reminders on, Monday to Friday");
      } else say("This phone is ready. Daily reminders start once storage is set up.");
      try { localStorage.setItem(KEY, "on"); } catch { /* still on for now */ }
      setState("on");
    } catch (error) { setState("off"); say(error instanceof Error ? error.message : "Couldn't turn reminders on"); }
  }

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
    <ul className={styles.reminderList}>
      {REMINDERS.map(r => <li key={r.id}><span className="numeric">{r.time}</span><span>{r.title}</span><span className={styles.reminderTag}>{r.action === "start" ? "Start" : "Finish"}</span></li>)}
    </ul>
    <Button variant="glass" size="small" icon={<Send/>} onClick={test} disabled={state !== "on"}>Send a test now</Button>
  </Glass>;
}
