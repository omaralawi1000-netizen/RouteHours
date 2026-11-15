"use client";

import { useMemo } from "react";
import { ArrowDownToLine, ArrowRight, CalendarDays, ChevronDown, Clipboard, Clock3, FileSpreadsheet, History, Mail, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { dateInZone } from "@/lib/ledger";
import { durationLabel, minutesBetween, type Shift } from "@/lib/time";
import type { DayDetails, PayrollProfile } from "@/lib/timesheet";
import type { ShiftTemplate } from "@/lib/templates";
import WeekView from "../week-view";
import { formatDay, formatTime } from "../features/format";

export type HistoryRange = "all" | "week" | "month";
export type HistoryState = {
  range: HistoryRange; setRange: (value: HistoryRange) => void;
  query: string; setQuery: (value: string) => void;
  expanded: string | null; setExpanded: (value: string | null) => void;
  exportOpen: boolean; setExportOpen: (value: boolean) => void;
};

type Props = {
  week: string;
  onWeek: (week: string) => void;
  shifts: Shift[];
  sorted: Shift[];
  profile: PayrollProfile;
  details: DayDetails;
  zone: string;
  templates: ShiftTemplate[];
  today: string;
  currentMonday: string;
  weekStart: number;
  weekEnd: number;
  history: HistoryState;
  creatingSheet: boolean;
  onReview: () => void;
  onEdit: (shift?: Shift, selectedDate?: string) => void;
  onSettings: () => void;
  onCsv: (detailed: boolean) => void;
  onBackup: () => void;
  onCopy: (shift: Shift) => void;
  onRetrySummary: (shift: Shift) => void;
  onDelete: (id: string) => void;
};

export default function WeekScreen(p: Props) {
  const { history, zone, sorted, shifts } = p;
  const monthStart = p.today.slice(0, 7) + "-01";
  const nextMonth = new Date(monthStart + "T12:00Z"); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const nextMonthKey = nextMonth.toISOString().slice(0, 10);
  const filteredShifts = useMemo(() => sorted.filter(shift => {
    if (history.range === "week" && (Date.parse(shift.start) >= p.weekEnd || Date.parse(shift.end) <= p.weekStart)) return false;
    if (history.range === "month" && !(dateInZone(shift.start, zone) < nextMonthKey && dateInZone(shift.end, zone) >= monthStart)) return false;
    const query = history.query.trim().toLocaleLowerCase();
    return !query || [formatDay(shift.start, zone), dateInZone(shift.start, zone), ...shift.notes, shift.summary?.overview || ""].join(" ").toLocaleLowerCase().includes(query);
  }), [sorted, history.range, history.query, p.weekStart, p.weekEnd, monthStart, nextMonthKey, zone]);

  return <div className="week-layout"><WeekView week={p.week} onWeek={p.onWeek} shifts={shifts} profile={p.profile} details={p.details} zone={zone} onReview={p.onReview} onEdit={p.onEdit} onAdd={() => p.onEdit(undefined, p.week === p.currentMonday ? p.today : p.week)} templates={p.templates} onSettings={p.onSettings}/><details className="all-history"><summary>All shifts & exports <History size={17}/></summary><section id="history" className="history-section surface"><div className="section-heading history-heading"><div><h2>Shift history</h2></div><div className="history-actions"><button className="secondary-btn" onClick={() => p.onEdit()}><Plus size={17}/> Add manually</button><div className="export-wrap"><button className="primary-outline" disabled={p.creatingSheet} onClick={() => history.setExportOpen(!history.exportOpen)}><ArrowDownToLine size={17}/> {p.creatingSheet ? "Creating…" : "Export"} <ChevronDown size={15}/></button>{history.exportOpen && <div className="export-menu"><button onClick={() => { p.onReview(); history.setExportOpen(false); }}><Mail size={18}/><span><strong>Weekly timesheet & email</strong><small>Preview, Excel file or Google Sheets</small></span></button><button onClick={() => p.onCsv(false)}><FileSpreadsheet size={18}/><span><strong>Download hours CSV</strong><small>Import into Google Sheets anytime</small></span></button><button onClick={() => p.onCsv(true)}><FileSpreadsheet size={18}/><span><strong>Detailed log CSV</strong><small>Includes notes and AI summaries</small></span></button><button onClick={() => { p.onBackup(); history.setExportOpen(false); }}><ArrowDownToLine size={18}/><span><strong>Backup data</strong><small>Save a copy you can restore later</small></span></button></div>}</div></div></div>
    <div className="history-toolbar"><div className="history-filters" role="group" aria-label="Filter shifts">{([["all", "All shifts"], ["week", "This week"], ["month", "This month"]] as const).map(([value, label]) => <button key={value} className={history.range === value ? "selected" : ""} aria-pressed={history.range === value} onClick={() => history.setRange(value)}>{label}</button>)}</div><label className="history-search"><Search size={16}/><input value={history.query} onChange={e => history.setQuery(e.target.value)} placeholder="Search dates or notes" aria-label="Search shifts"/></label></div>
    {shifts.length > 0 && <p className="history-count">Showing {filteredShifts.length} of {shifts.length} shifts · Weekly export lets you choose a week. CSV includes all shifts.</p>}
    {sorted.length === 0 ? <div className="empty-state"><div className="empty-illustration"><Clock3 size={32}/></div><h3>Your shifts will show up here</h3><p>Start the timer for your next bus ride, or add a past shift manually.</p></div> : filteredShifts.length === 0 ? <div className="empty-state filter-empty"><div className="empty-illustration"><Search size={29}/></div><h3>No matching shifts</h3><p>Try another date range or search term.</p><button onClick={() => { history.setRange("all"); history.setQuery(""); }}>Clear filters</button></div> : <div className="shift-list">{filteredShifts.map(shift => { const open = history.expanded === shift.id; return <div className={`shift-item ${open ? "expanded" : ""}`} key={shift.id}><button className="shift-summary" onClick={() => history.setExpanded(open ? null : shift.id)} aria-expanded={open}><span className="shift-date-icon"><CalendarDays size={18}/></span><span className="shift-main"><strong>{formatDay(shift.start, zone)}</strong><small>{formatTime(shift.start, zone)} <ArrowRight size={13}/> {formatTime(shift.end, zone)}</small></span><span className="shift-duration">{durationLabel(minutesBetween(shift.start, shift.end))}</span><ChevronDown className="shift-chevron" size={18}/></button>{open && <div className="shift-detail"><div className="detail-grid"><div><span className="detail-label">STARTED</span><strong>{new Date(shift.start).toLocaleString("en-GB", { timeZone: zone })}</strong></div><div><span className="detail-label">FINISHED</span><strong>{new Date(shift.end).toLocaleString("en-GB", { timeZone: zone })}</strong></div><div><span className="detail-label">DECIMAL HOURS</span><strong>{(minutesBetween(shift.start, shift.end) / 60).toFixed(2)} h</strong></div></div><div className="detail-notes"><span className="detail-label">YOUR NOTES</span>{shift.notes.length ? shift.notes.map((note, i) => <p key={i}>• {note}</p>) : <p className="muted">No notes recorded.</p>}</div>{shift.summaryStatus === "pending" && <div className="ai-panel"><Sparkles size={18}/><span>Creating your summary…</span><span className="mini-spinner"/></div>}{shift.summary && <div className="summary-panel"><div className="summary-title"><Sparkles size={17}/> AI SHIFT SUMMARY</div><p>{shift.summary.overview}</p>{([["Activities", shift.summary.activities], ["Notable moments", shift.summary.notable], ["Follow-up", shift.summary.followUp]] as const).map(([title, values]) => values.length > 0 && <div className="summary-group" key={title}><strong>{title}</strong><ul>{values.map((value, i) => <li key={i}>{value}</li>)}</ul></div>)}</div>}{shift.summaryStatus === "error" && shift.summaryError && <p className="summary-error" role="alert">{shift.summaryError}</p>}{(!shift.summary || shift.summaryStatus === "error") && <button className="text-action" onClick={() => p.onRetrySummary(shift)}><Sparkles size={16}/>{shift.summaryStatus === "error" ? "Retry AI summary" : "Generate AI summary"}</button>}<div className="shift-controls"><button onClick={() => p.onCopy(shift)}><Clipboard size={15}/> Copy hours</button><button onClick={() => p.onEdit(shift)}><Pencil size={15}/> Edit shift</button><button className="danger" onClick={() => p.onDelete(shift.id)}><Trash2 size={15}/> Delete</button></div></div>}</div>; })}</div>}
  </section></details></div>;
}
