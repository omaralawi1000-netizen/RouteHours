"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LazyMotion, domMax, MotionConfig, m, useMotionValue, useTransform, animate } from "motion/react";
import { Send, Trash2 } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
import HoldButton from "../ui/hold-button";
import MicPill, { type MicState } from "../ui/mic-pill";
import SegmentedControl from "../ui/segmented-control";
import Sheet from "../ui/sheet";
import StatusPill, { type WeekStatus } from "../ui/status-pill";
import Toast, { type ToastMessage } from "../ui/toast";
import Toggle from "../ui/toggle";
import WeekStrip, { type WeekData } from "../ui/week-strip";
import { setHaptics, tick } from "../ui/haptics";
import { spring, springSpec, type SpringName } from "../ui/motion";
import TodayHero, { hm, type Phase } from "./today-hero";
import styles from "./lab.module.css";

type Look = "night" | "day";
type View = Look | "split";

const WEEKS: WeekData[] = [
  { label: "26 Oct – 1 Nov", days: [["Mon", 462], ["Tue", 445], ["Wed", 0], ["Thu", 478], ["Fri", 431], ["Sat", 250], ["Sun", 0]].map(([short, minutes]) => ({ short: String(short)[0], minutes: Number(minutes) })) },
  { label: "2 – 8 Nov", days: [["Mon", 470], ["Tue", 0], ["Wed", 455], ["Thu", 488], ["Fri", 440], ["Sat", 0], ["Sun", 0]].map(([short, minutes]) => ({ short: String(short)[0], minutes: Number(minutes) })) },
  { label: "This week", days: [["Mon", 465], ["Tue", 442], ["Wed", 0], ["Thu", 0], ["Fri", 0], ["Sat", 0], ["Sun", 0]].map(([short, minutes]) => ({ short: String(short)[0], minutes: Number(minutes) })) },
];

export default function Lab() {
  const [view, setView] = useState<View>("night");
  const [blur, setBlur] = useState(true);
  const [reduce, setReduce] = useState(false);
  const [haptics, setHapticsOn] = useState(true);
  const [weight, setWeight] = useState<"300" | "200">("300");
  const look: Look = view === "day" ? "day" : "night";

  // Today hero state, shared by both halves of the split view.
  const [phase, setPhase] = useState<Phase>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [endedAt, setEndedAt] = useState(0);
  const [weekMinutes, setWeekMinutes] = useState(907);
  const [chipPulse, setChipPulse] = useState(0);
  const [saved, setSaved] = useState<{ minutes: number; startedAt: number } | null>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, run: () => void) => { timers.current.push(window.setTimeout(run, ms)); };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const say = useCallback((text: string, action?: ToastMessage["action"]) => setToast({ id: Date.now(), text, action }), []);
  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => { setDateLabel(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" }).format(Date.now())); }, []);
  useEffect(() => { setHaptics(haptics); }, [haptics]);
  useEffect(() => {
    const color = look === "night" ? "#0A0C11" : "#F3F0EA";
    document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color]").forEach(meta => { meta.removeAttribute("media"); meta.content = color; });
    document.documentElement.style.background = color;
  }, [look]);

  function changeView(next: View) {
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (doc.startViewTransition && !reduce && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(() => flushSync(() => setView(next)));
    else setView(next);
  }

  function start() {
    tick(); setSaved(null);
    setStartedAt(Date.now()); setPhase("running");
  }
  function finish() {
    tick();
    const end = Date.now(), minutes = Math.round((end - startedAt) / 60000);
    setEndedAt(end); setPhase("landing");
    later(400, () => { setWeekMinutes(total => total + minutes); setChipPulse(p => p + 1); });
    later(1150, () => { setPhase("idle"); setSaved({ minutes, startedAt }); });
    later(7000, () => setSaved(current => current?.startedAt === startedAt ? null : current));
  }
  function undoFinish() {
    if (!saved) return;
    setWeekMinutes(total => total - saved.minutes);
    setStartedAt(saved.startedAt); setPhase("running"); setSaved(null);
    say("Shift resumed");
  }

  // Timesheet
  const [status, setStatus] = useState<WeekStatus>("reviewed");
  const [statusPulse, setStatusPulse] = useState(0);
  // Week swipe
  const [weekIndex, setWeekIndex] = useState(WEEKS.length - 1);
  const [todayIndex, setTodayIndex] = useState(-1);
  useEffect(() => { setTodayIndex((new Date().getDay() + 6) % 7); }, []);
  const weeks = WEEKS.map((week, index) => index === WEEKS.length - 1 ? { ...week, days: week.days.map((day, i) => ({ ...day, today: i === todayIndex })) } : week);
  // Sheet
  const [sheet, setSheet] = useState(false);
  // Voice
  const [mic, setMic] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [micSeconds, setMicSeconds] = useState(0);
  useEffect(() => {
    if (mic !== "listening") return;
    const begun = Date.now();
    const timer = window.setInterval(() => {
      setLevel(current => Math.max(0.08, Math.min(1, current * 0.55 + Math.random() * 0.75)));
      setMicSeconds(Math.floor((Date.now() - begun) / 1000));
    }, 90);
    return () => window.clearInterval(timer);
  }, [mic]);
  function toggleMic() {
    if (mic === "idle") { setMicSeconds(0); setLevel(0.3); setMic("listening"); return; }
    if (mic === "listening") { setMic("writing"); window.setTimeout(() => { setMic("idle"); say("Note added: Late from Aarhus C, roadworks"); }, 1300); }
  }

  const hero = (which: Look) => <TodayHero look={which} phase={phase} startedAt={startedAt} endedAt={endedAt} weekMinutes={weekMinutes} chipPulse={chipPulse} dateLabel={dateLabel} saved={saved ? `${hm(saved.minutes)} added to this week` : null} onUndo={undoFinish}
    onStart={start} onFinish={finish} onFastForward={() => setStartedAt(value => value - 3_600_000)}/>;

  return <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduce ? "always" : "user"}>
      <div className={`look ${styles.lab}`} data-look={look} data-blur={blur ? "on" : "off"} style={{ ["--number-weight" as string]: weight }}>
        <header className={styles.bar}>
          <p className={styles.brand}><span className="serif">Headlight</span><span className={styles.brandLab}>lab</span></p>
          <SegmentedControl label="Look" value={view} onChange={changeView} options={[{ value: "night", label: "Night" }, { value: "day", label: "Day" }, { value: "split", label: "Both" }]}/>
        </header>

        {view === "split" ? <SplitCompare night={hero("night")} day={hero("day")}/> : hero(look)}

        <main className={styles.sections}>
          <Section title="How to test this" note="Use it like a real shift. Start, wait a few seconds, press Jump 1 hour, then Finish. Watch the time fly into your week. Try Undo. Then work down the page.">
            <div className={styles.rows}>
              <Row label="Live blur" hint="Turn off to compare battery-friendly glass"><Toggle label="Live blur" checked={blur} onChange={setBlur}/></Row>
              <Row label="Reduce motion" hint="What it feels like with motion turned down"><Toggle label="Reduce motion" checked={reduce} onChange={setReduce}/></Row>
              <Row label="Haptics" hint="A light tick on Start, Finish and Send"><Toggle label="Haptics" checked={haptics} onChange={setHapticsOn}/></Row>
              <Row label="Number weight" hint="200 is thinner. Check it outside in daylight"><SegmentedControl label="Number weight" value={weight} onChange={setWeight} options={[{ value: "300", label: "300" }, { value: "200", label: "200" }]}/></Row>
            </div>
          </Section>

          <Section title="Send the week" note="Sending the timesheet is the one thing you can't take back, so you hold it. Let go early and it springs back. A quick tap tells you to hold.">
            <div className={styles.sendHead}>
              <div>
                <p className={styles.small}>Week 46 · 9 – 15 Nov</p>
                <p className={`${styles.weekTotal} numeric`}>{hm(weekMinutes)}</p>
              </div>
              <StatusPill status={status} pulse={statusPulse}/>
            </div>
            <HoldButton icon={<Send/>} disabled={status === "sent"} onConfirm={() => { setStatus("sent"); setStatusPulse(p => p + 1); say("Timesheet sent"); }}>{status === "sent" ? "Sent" : "Hold to send timesheet"}</HoldButton>
            <div className={styles.inline}>
              <Button variant="quiet" size="small" onClick={() => { setStatus("changed"); setStatusPulse(0); }} disabled={status !== "sent"}>Edit a sent shift</Button>
              <Button variant="quiet" size="small" onClick={() => { setStatus("reviewed"); setStatusPulse(0); }}>Reset</Button>
            </div>
          </Section>

          <Section title="Swipe through weeks" note="Drag the bars left or right. There's no week after this one, so that way it stretches and snaps back.">
            <WeekStrip weeks={weeks} index={weekIndex} onIndex={setWeekIndex}/>
          </Section>

          <Section title="Edit a shift" note="Opens as a sheet. Drag the handle down to close it, or use Back. Pull it up and it resists.">
            <Button variant="glass" onClick={() => setSheet(true)}>Open Tuesday's shift</Button>
          </Section>

          <Section title="Voice note" note="Tap to talk, tap to stop. The button grows into a live waveform, then writes it out.">
            <div className={styles.inline}><MicPill state={mic} level={level} seconds={micSeconds} onToggle={toggleMic}/></div>
          </Section>

          <Section title="Messages" note="Show one, then replace it while it's up. It reshapes instead of stacking. Swipe it sideways to dismiss.">
            <div className={styles.inline}>
              <Button variant="glass" size="small" onClick={() => say("Backup saved on this phone")}>Show a message</Button>
              <Button variant="glass" size="small" onClick={() => say("Shift deleted", { label: "Undo", onClick: () => say("Shift restored") })}>Replace it</Button>
            </div>
          </Section>

          <Section title="The six springs" note="Every movement in the app uses one of these. Tap a row to feel it.">
            <SpringTable/>
          </Section>

          <footer className={styles.footer}>
            <p className="serif">How does it feel?</p>
            <p>Rate it 1 to 10 and tell me Night or Day. At 8 or more, I build the real screens in this style.</p>
          </footer>
        </main>

        <Sheet open={sheet} onClose={() => setSheet(false)} title="Tuesday's shift" footer={<>
          <Button variant="danger" icon={<Trash2/>} onClick={() => { setSheet(false); say("Shift deleted", { label: "Undo", onClick: () => say("Shift restored") }); }}>Delete</Button>
          <Button variant="primary" onClick={() => { setSheet(false); say("Shift updated"); }}>Save</Button>
        </>}>
          <div className={styles.form}>
            <label className={styles.field}><span>Started</span><input type="time" defaultValue="06:12"/></label>
            <label className={styles.field}><span>Finished</span><input type="time" defaultValue="13:34"/></label>
            <label className={`${styles.field} ${styles.wide}`}><span>Note</span><textarea rows={3} defaultValue="Route 2A. Swapped bus at Park Allé."/></label>
          </div>
        </Sheet>
        <Toast message={toast} onDismiss={() => setToast(null)}/>
      </div>
    </MotionConfig>
  </LazyMotion>;
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <Glass className={styles.section}>
    <h2 className={`${styles.sectionTitle} serif`}>{title}</h2>
    <p className={styles.note}>{note}</p>
    <div className={styles.sectionBody}>{children}</div>
  </Glass>;
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <div className={styles.row}><div><p>{label}</p><p className={styles.small}>{hint}</p></div>{children}</div>;
}

/** Night on the left, Day on the right, the same live screen. Drag the divider to wipe between them. */
function SplitCompare({ night, day }: { night: ReactNode; day: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const clip = useTransform(x, value => `inset(0 0 0 ${value}px)`);
  useEffect(() => {
    const place = () => { if (box.current) x.set(box.current.clientWidth / 2); };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [x]);
  return <div ref={box} className={styles.split}>
    <div className="look" data-look="night">{night}</div>
    <m.div className={`look ${styles.splitDay}`} data-look="day" style={{ clipPath: clip }}>{day}</m.div>
    <m.div className={styles.divider} style={{ x }} drag="x" dragConstraints={box} dragElastic={0} dragMomentum={false} role="slider" aria-label="Compare Night and Day" aria-valuemin={0} aria-valuemax={100} aria-valuenow={50} tabIndex={0}
      onKeyDown={event => { const width = box.current?.clientWidth ?? 0; if (event.key === "ArrowLeft") animate(x, Math.max(0, x.get() - width / 10), spring.snappy); if (event.key === "ArrowRight") animate(x, Math.min(width, x.get() + width / 10), spring.snappy); }}>
      <span className={styles.dividerKnob}><span>Night</span><span>Day</span></span>
    </m.div>
  </div>;
}

function SpringTable() {
  return <div className={styles.springs}>{(Object.keys(springSpec) as SpringName[]).map(name => <SpringRow key={name} name={name}/>)}</div>;
}

function SpringRow({ name }: { name: SpringName }) {
  const track = useRef<HTMLButtonElement>(null);
  const [x, setX] = useState(0);
  const spec = springSpec[name];
  return <button ref={track} type="button" className={styles.springRow} onClick={() => { const width = (track.current?.querySelector(`.${styles.springTrack}`) as HTMLElement | null)?.clientWidth ?? 0; setX(current => current ? 0 : Math.max(0, width - 18)); }}>
    <span className={styles.springText}>
      <span className={styles.springName}>{name}</span>
      <span className={`${styles.small} numeric`}>{spec.duration.toFixed(2)} s{spec.bounce ? ` · bounce ${spec.bounce}` : ""}</span>
      <span className={styles.small}>{spec.job}</span>
    </span>
    <span className={styles.springTrack}><m.span className={styles.springDot} animate={{ x }} transition={spring[name]}/></span>
  </button>;
}
