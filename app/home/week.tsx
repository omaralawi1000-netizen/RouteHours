"use client";

import { AnimatePresence, m } from "motion/react";
import { ChevronRight, FileSpreadsheet, Plus, TriangleAlert } from "lucide-react";
import Button from "../ui/button";
import Glass from "../ui/glass";
import SegmentedControl from "../ui/segmented-control";
import StatusPill, { type WeekStatus } from "../ui/status-pill";
import WeekStrip, { type WeekData } from "../ui/week-strip";
import { spring } from "../ui/motion";
import { tick } from "../ui/haptics";
import { item } from "../lab/stagger";
import { AskCard, PayslipCard, type Logged } from "./ai";
import { hm, kr } from "./usual";
import styles from "./home.module.css";

export type DayMark = "worked" | "syg" | "fri";
/** One day of the chosen week: its date, the pieces worked, and a Syg/Fri mark. */
export type WeekDayRow = { date: string; name: string; dateLabel: string; minutes: number; pieces: { id: string; start: string; end: string }[]; mark?: "Syg" | "Fri"; today: boolean };

/** Week: swipe through weeks, fix any day, then review and send the timesheet. */
export default function Week(props: {
  weeks: WeekData[]; index: number; onIndex: (index: number) => void; title: string; days: WeekDayRow[]; total: number; rate: number;
  warnings: string[]; status: WeekStatus; statusPulse: number; isCurrent: boolean; todayMark: DayMark; onTodayMark: (mark: DayMark) => void;
  onOpenShift: (id: string) => void; onAddShift: (date: string) => void; onReview: () => void;
  apiKey: string; context: () => string; logged: (from: string, to: string) => Logged; say: (text: string) => void; onNeedKey: () => void;
}) {
  const worked = props.days.filter(d => d.minutes > 0).length;
  return <>
    <m.header variants={item} className={styles.top}>
      <div><p className={styles.eyebrow}>{props.title}</p><h1 className={`${styles.title} serif`}>Your week</h1></div>
    </m.header>
    <m.section variants={item}><Glass blur className={styles.card}><WeekStrip weeks={props.weeks} index={props.index} onIndex={props.onIndex}/></Glass></m.section>

    <AnimatePresence initial={false}>
      {props.warnings.length > 0 && <m.section key="warn" className={styles.alert} role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: spring.exit }} transition={spring.settle}>
        <span className={styles.alertIcon} aria-hidden="true"><TriangleAlert/></span>
        <div className={styles.alertText}>{props.warnings.map(w => <p key={w}>{w}</p>)}</div>
      </m.section>}
    </AnimatePresence>

    <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Days</h2><span className={styles.cardMeta}>Tap a day to fix it</span></div>
        <ul className={styles.list}>
          {props.days.map(day => <li key={day.date}>
            <m.button type="button" className={styles.shiftRow} whileTap={{ scale: 0.98 }} transition={spring.tap}
              onClick={() => day.pieces.length ? props.onOpenShift(day.pieces[0].id) : props.onAddShift(day.date)}
              aria-label={day.pieces.length ? `Edit ${day.name}'s shift` : `Add a shift on ${day.name}`}>
              <span className={styles.rowDay}>{day.name}{day.today ? " · today" : ""}
                <small className="numeric">{day.mark ? day.mark : day.pieces.length ? day.pieces.map(p => `${p.start}–${p.end}`).join(" + ") : day.dateLabel}</small>
              </span>
              <span className={`${styles.rowValue} numeric`}>{day.minutes ? hm(day.minutes) : day.mark ? "" : "–"}</span>
              <ChevronRight className={styles.chev} aria-hidden="true"/>
            </m.button>
            {day.pieces.length > 1 && <div className={styles.morePieces}>
              {day.pieces.slice(1).map(p => <button key={p.id} type="button" className={styles.pieceLink} onClick={() => props.onOpenShift(p.id)}>Edit <span className="numeric">{p.start}–{p.end}</span></button>)}
            </div>}
          </li>)}
        </ul>
        <Button variant="glass" size="small" icon={<Plus/>} onClick={() => props.onAddShift((props.days.find(d => d.today) ?? props.days.find(d => !d.minutes) ?? props.days[0]).date)}>Add a shift</Button>
      </Glass>
    </m.section>

    {props.isCurrent && <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Today was</h2><span className={styles.cardMeta}>Goes on the timesheet</span></div>
        <SegmentedControl label="Mark today" value={props.todayMark} onChange={props.onTodayMark} options={[{ value: "worked", label: "Worked" }, { value: "syg", label: "Sick" }, { value: "fri", label: "Day off" }]}/>
      </Glass>
    </m.section>}

    <m.section variants={item}>
      <Glass blur className={styles.card}>
        <div className={styles.cardHead}><h2 className={`${styles.cardTitle} serif`}>Timesheet</h2><StatusPill status={props.status} pulse={props.statusPulse}/></div>
        <div className={styles.sendTotals}>
          <div><p className={styles.statLabel}>Worked</p><p className={`${styles.sendBig} numeric`}>{hm(props.total)}</p></div>
          <div><p className={styles.statLabel}>Days</p><p className={`${styles.sendBig} numeric`}>{worked}</p></div>
        </div>
        <p className={styles.hint}>≈ {kr(props.total, props.rate)} before tax</p>
        <Button variant="primary" icon={<FileSpreadsheet/>} onClick={() => { tick(); props.onReview(); }}>{props.status === "sent" ? "See what was sent" : "Review & send"}</Button>
        <p className={styles.hint}>See the Excel sheet and the email before it goes. Fix any day right there.</p>
      </Glass>
    </m.section>
    <m.section variants={item}><AskCard apiKey={props.apiKey} context={props.context} say={props.say} onNeedKey={props.onNeedKey}/></m.section>
    <m.section variants={item}><PayslipCard apiKey={props.apiKey} logged={props.logged} say={props.say} onNeedKey={props.onNeedKey} rate={props.rate}/></m.section>
    <m.p variants={item} className={styles.hint}>Swipe the bars sideways to change week. Sending is the one thing you can&apos;t undo, so you hold it.</m.p>
  </>;
}
