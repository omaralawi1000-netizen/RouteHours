import { zonedInstant } from './ledger.ts';
import { validShift } from './storage.ts';
import type { Shift } from './time.ts';
export type VoicePlan = { action: 'create' | 'edit' | 'clarify'; explanation: string; entries: { id: string; start: string; end: string }[] };
export function isTimeRequest(text: string) {
  if (/^(how|what|where|why|hvordan|hvad|hvor)\b/i.test(text)) return false;
  return /\b(worked|log|correct|change|move|yesterday)\b|arbejdede|i går|ændr|\bret\b/i.test(text) && /\d|\b(hours?|time|finish|start|seven|nine|one|three|two|eight|four|five|six|ten|eleven|twelve)\b|timer|klokken|slut|syv|ni|tre|tid/i.test(text);
}
export function validateVoicePlan(value: unknown): VoicePlan {
  if (!value || typeof value !== 'object') throw new Error('Could not interpret that. Your words are still here; try specific dates and 24-hour times.');
  const p = value as VoicePlan;
  if (!['create','edit','clarify'].includes(p.action) || typeof p.explanation !== 'string' || !Array.isArray(p.entries) || p.entries.length > 10 || p.entries.some(e => typeof e.id !== 'string' || typeof e.start !== 'string' || typeof e.end !== 'string')) throw new Error('The proposed change was invalid. Nothing was changed.');
  if (p.action !== 'clarify' && !p.entries.length) throw new Error('No times were found. Add a date, start and finish time.');
  return p;
}
export function proposedShifts(plan: VoicePlan, existing: Shift[], zone: string): Shift[] {
  if (plan.action === 'clarify') return [];
  const ids = new Set<string>();
  return plan.entries.map(entry => {
    const old = plan.action === 'edit' ? existing.find(s => s.id === entry.id) : undefined;
    if (plan.action === 'edit' && (!old || ids.has(entry.id))) throw new Error('The shift to edit is missing or repeated. Try again.');
    ids.add(entry.id);
    const start = zonedInstant(entry.start, zone, true), end = zonedInstant(entry.end, zone, true);
    const result: Shift = { id: old?.id || crypto.randomUUID(), start, end, notes: old?.notes || [] };
    if (!validShift(result) || Date.parse(end) - Date.parse(start) > 24 * 3600000) throw new Error('Check the proposed times. Each shift must finish after its start and be no longer than 24 hours.');
    return result;
  });
}
