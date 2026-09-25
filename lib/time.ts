export type Summary = {
  overview: string;
  activities: string[];
  notable: string[];
  followUp: string[];
};

export type Shift = {
  id: string;
  start: string;
  end: string;
  notes: string[];
  summary?: Summary;
  summaryStatus?: "pending" | "done" | "error";
};

export type ActiveShift = { start: string; notes: string[] };

export function minutesBetween(start: string, end: string): number {
  const difference = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(difference) ? Math.max(0, Math.round(difference / 60000)) : 0;
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${String(remainder).padStart(2, "0")}m` : `${remainder}m`;
}

export function localDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function thisWeekStart(now = new Date()): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function shiftsCsv(shifts: Shift[], detailed = false): string {
  const header = ["Date", "Start", "End", "Minutes", "Decimal hours", ...(detailed ? ["Notes", "AI overview", "Activities", "Notable", "Follow-up"] : [])];
  const lines = shifts.slice().sort((a, b) => a.start.localeCompare(b.start)).map((shift) => {
    const minutes = minutesBetween(shift.start, shift.end);
    const cells: (string | number)[] = [
      localDateKey(shift.start),
      new Date(shift.start).toLocaleString("en-GB"),
      new Date(shift.end).toLocaleString("en-GB"),
      minutes,
      (minutes / 60).toFixed(4),
    ];
    if (detailed) cells.push(shift.notes.join(" | "), shift.summary?.overview ?? "", shift.summary?.activities.join(" | ") ?? "", shift.summary?.notable.join(" | ") ?? "", shift.summary?.followUp.join(" | ") ?? "");
    return cells.map(csvCell).join(",");
  });
  return "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
