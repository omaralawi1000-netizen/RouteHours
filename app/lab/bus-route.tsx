"use client";

import { useEffect, useState } from "react";
import { m } from "motion/react";
import { ArrowUpRight, Bus, ClipboardPaste, MapPinned, Trash2 } from "lucide-react";
import { findLink, isMapsHost, isShortLink, parseMapsLink, shortPlace, transitNow, type MapsRoute } from "../api/maps/parse";
import Button from "../ui/button";
import Glass from "../ui/glass";
import { spring } from "../ui/motion";
import styles from "./lab.module.css";

const KEY = "routehours:lab-route";

/** The bus route Omar pasted once, kept on this phone. */
export function useBusRoute() {
  const [route, setRoute] = useState<MapsRoute | null>(null);
  useEffect(() => {
    try { const saved = localStorage.getItem(KEY); if (saved) setRoute(JSON.parse(saved) as MapsRoute); } catch { /* nothing saved */ }
  }, []);
  function save(next: MapsRoute | null) {
    setRoute(next);
    try { if (next) localStorage.setItem(KEY, JSON.stringify(next)); else localStorage.removeItem(KEY); } catch { /* kept for this visit */ }
  }
  return { route, save };
}

function names(route: MapsRoute) {
  if (route.from && route.to) return { from: shortPlace(route.from), to: shortPlace(route.to) };
  if (route.to) return { from: "Here", to: shortPlace(route.to) };
  return null;
}

/**
 * On Today: one tap opens Google Maps on the bus, leaving now, so the next departure is the
 * first thing you see. Shown while you're off shift.
 */
export function BusCard({ route, when, onAdd }: { route: MapsRoute | null; when: string | null; onAdd: () => void }) {
  if (!route) return <m.button type="button" className={styles.busAdd} onClick={onAdd} whileTap={{ scale: 0.98 }} transition={spring.tap}>
    <span className={styles.busIcon} aria-hidden="true"><MapPinned/></span>
    <span className={styles.busText}><span className={styles.busTitle}>Add your bus route</span><span className={styles.small}>Paste a Google Maps link once</span></span>
  </m.button>;
  const label = names(route);
  return <m.a href={transitNow(route)} target="_blank" rel="noopener noreferrer" className={styles.busLink} whileTap={{ scale: 0.98 }} transition={spring.tap} aria-label={`Open the next bus${label ? ` from ${label.from} to ${label.to}` : ""} in Google Maps`}>
    <Glass blur className={styles.busCard}>
      <span className={styles.busIcon} aria-hidden="true"><Bus/></span>
      <span className={styles.busText}>
        <span className={styles.eyebrow}>{when ?? "Your bus"}</span>
        {label
          ? <span className={styles.busRoute}><span>{label.from}</span><span className={styles.busLine} aria-hidden="true"/><span>{label.to}</span></span>
          : <span className={styles.busTitle}>Your saved route</span>}
      </span>
      <span className={styles.busGo} aria-hidden="true"><ArrowUpRight/></span>
    </Glass>
  </m.a>;
}

/** On the Lab tab: paste the link from Google Maps' Share button. */
export function BusRouteSettings({ route, onSave, say }: { route: MapsRoute | null; onSave: (route: MapsRoute | null) => void; say: (text: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(input = text) {
    const link = findLink(input);
    if (!link || !isMapsHost(new URL(link).hostname)) { say("Paste a link from Google Maps"); return; }
    setBusy(true);
    let next: MapsRoute = parseMapsLink(link);
    if (isShortLink(link)) {
      try {
        const res = await fetch(`/api/maps/resolve?url=${encodeURIComponent(link)}`);
        if (res.ok) next = { ...(await res.json() as MapsRoute), url: link };
      } catch { /* keep the link as it is */ }
    }
    setBusy(false); setText(""); onSave(next);
    const label = names(next);
    say(label ? `Route saved: ${label.from} → ${label.to}` : "Route saved. It opens your link as it is.");
  }
  async function paste() {
    try { const clip = await navigator.clipboard.readText(); setText(clip); if (findLink(clip)) await save(clip); }
    catch { say("Long-press the box and tap Paste"); }
  }
  const label = route && names(route);
  return <Glass blur className={styles.card}>
    <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Bus route</h2><span className={styles.cardMeta}>Shows on Today</span></div>
    <p className={styles.hint}>In Google Maps, plan the trip by bus, tap Share, then Copy link. Paste it here once. The card on Today then opens the next bus, leaving now.</p>
    {route && <div className={styles.busSaved}>
      <span className={styles.busIcon} aria-hidden="true"><Bus/></span>
      <span className={styles.busText}>{label ? <span className={styles.busRoute}><span>{label.from}</span><span className={styles.busLine} aria-hidden="true"/><span>{label.to}</span></span> : <span className={styles.busTitle}>Your saved link</span>}</span>
      <button type="button" className={styles.alertClose} aria-label="Remove the bus route" onClick={() => { onSave(null); say("Bus route removed"); }}><Trash2 aria-hidden="true"/></button>
    </div>}
    <label className={`${styles.field} ${styles.wide}`}><span>Google Maps link</span>
      <input className={styles.linkInput} type="url" inputMode="url" placeholder="https://maps.app.goo.gl/…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void save(); }}/>
    </label>
    <div className={styles.inline}>
      <Button variant="glass" size="small" icon={<ClipboardPaste/>} onClick={() => void paste()} disabled={busy}>Paste</Button>
      <Button variant="primary" size="small" onClick={() => void save()} disabled={busy || !text.trim()}>{route ? "Replace route" : "Save route"}</Button>
    </div>
  </Glass>;
}
