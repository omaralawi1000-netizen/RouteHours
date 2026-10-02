import { validateBackup, decodeSubmissions, type Submission } from './storage.ts';
import type { ActiveShift, Shift } from './time.ts';
import type { DayDetails, PayrollProfile } from './timesheet.ts';
import { validateTemplates, type ShiftTemplate } from './templates.ts';

export const MAX_BACKUP_BYTES = 30 * 1024 * 1024;
type BackupSource = { shifts: Shift[]; active: ActiveShift | null; noteDraft: string; payroll: PayrollProfile; dayDetails: DayDetails; workZone: string; templates: ShiftTemplate[] };
export async function createBackup(source: BackupSource, submissions: Submission[], createdAt = new Date().toISOString()) {
  // An explicit allowlist keeps provider credentials and OAuth IDs out of both backup formats.
  const data = structuredClone({ version: 3, kind: 'routehours-backup', createdAt, shifts: source.shifts, active: source.active, noteDraft: source.noteDraft, payroll: source.payroll, dayDetails: source.dayDetails, workZone: source.workZone, templates: validateTemplates(source.templates) });
  const records = await Promise.all(submissions.map(async receipt => {
    const bytes = new Uint8Array(await receipt.attachment.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { ...receipt, attachment: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + btoa(binary) };
  }));
  const result = { ...data, submissions: records };
  validateBackup(result); decodeSubmissions(result.submissions);
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_BYTES) throw new Error('This complete backup is larger than 30 MB. Keep a local export of your records.');
  return { data: result, blob };
}

export function parseBackupText(text: string) {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Choose a backup smaller than 30 MB.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This backup is not valid JSON. Your current records have not changed.'); }
  validateBackup(data); decodeSubmissions(data.submissions);
  return data;
}
