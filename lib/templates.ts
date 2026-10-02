import { addDays, zonedInstant } from './ledger.ts';
import type { Shift } from './time.ts';

export type ShiftTemplate = { id: string; name: string; start: string; end: string };
export const DEFAULT_TEMPLATES: ShiftTemplate[] = [
  { id: 'morning', name: 'Morning', start: '07:00', end: '09:00' },
  { id: 'afternoon', name: 'Afternoon', start: '13:00', end: '15:00' },
];
const validTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validateTemplates(value: unknown): ShiftTemplate[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('Use up to eight valid shift templates.');
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 50 || !validTime(item.start) || !validTime(item.end) || item.start === item.end) throw new Error('Each template needs a unique ID, a name, and different valid start and finish times.');
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), start: item.start, end: item.end };
  });
}

/** A template creates an editable draft only; callers must explicitly save it. */
export function templateShift(template: ShiftTemplate, date: string, zone: string, id = crypto.randomUUID()): Shift {
  const [valid] = validateTemplates([template]);
  const day = new Date(date + 'T12:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== date) throw new Error('Choose a valid date for the template.');
  const endDate = valid.end < valid.start ? addDays(date, 1) : date;
  const start = zonedInstant(date + 'T' + valid.start, zone, true);
  const end = zonedInstant(endDate + 'T' + valid.end, zone, true);
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0 || duration > 24 * 3600000) throw new Error('Check these times. A shift must finish after it starts and be within 24 hours.');
  return { id, start, end, notes: [] };
}
