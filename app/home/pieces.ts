import type { DayPiece } from "../../lib/ledger.ts";
import type { Shift } from "../../lib/time.ts";

/**
 * What is left of a shift once one day's part of it is removed: removing Monday's 00:00–06:00 from a
 * Sunday 22:00–Monday 06:00 shift keeps Sunday's two hours. A shift inside the day goes completely. The
 * part that keeps the shift's id keeps its notes; any summary was about the whole shift, so it is made again.
 */
export function withoutPiece(piece: DayPiece): Shift[] {
  const { shift } = piece;
  const before = Date.parse(piece.start) > Date.parse(shift.start), after = Date.parse(piece.end) < Date.parse(shift.end);
  const fresh = { summary: undefined, summaryStatus: undefined, summaryError: undefined };
  const kept: Shift[] = [];
  if (before) kept.push({ ...shift, ...fresh, end: piece.start });
  if (after) kept.push(before ? { id: crypto.randomUUID(), start: piece.end, end: shift.end, notes: [] } : { ...shift, ...fresh, start: piece.end });
  return kept;
}
