import type { Shift } from './time.ts';
import type { WeeklyReport } from './timesheet.ts';

export type Submission = { id: string; week: string; report: WeeklyReport; fingerprint: string; recipient: string; sender: string; subject: string; message: string; filename: string; attachment: Blob; createdAt: string; status: 'reviewed' | 'sending' | 'sent' | 'uncertain'; gmailId?: string };
export function stateSignature(data: object) { return JSON.stringify(Object.keys(data).sort().map(key => [key, (data as Record<string, unknown>)[key]])); }
export function reportFingerprint(report: WeeklyReport) { return JSON.stringify({ ...report, profile: { ...report.profile, email: '' } }); }
export function validShift(value: unknown): value is Shift {
  if (!value || typeof value !== 'object') return false;
  const s = value as Shift;
  return typeof s.id === 'string' && s.id.length > 0 && typeof s.start === 'string' && typeof s.end === 'string' && Number.isFinite(Date.parse(s.start)) && Date.parse(s.end) > Date.parse(s.start) && Array.isArray(s.notes) && s.notes.every(n => typeof n === 'string') && (!s.summary || typeof s.summary.overview === 'string' && [s.summary.activities, s.summary.notable, s.summary.followUp].every(a => Array.isArray(a) && a.every(n => typeof n === 'string')));
}
export function validateBackup(value: unknown): asserts value is { shifts: Shift[]; active?: { start: string; notes: string[] }; payroll?: { name: string; number: string; email: string }; dayDetails?: Record<string, Record<string, string>>; noteDraft?: string; workZone?: string; submissions?: unknown[] } {
  if (!value || typeof value !== 'object') throw new Error('This is not a RouteHours backup.');
  const d = value as Record<string, unknown>;
  if (!Array.isArray(d.shifts) || !d.shifts.every(validShift) || new Set(d.shifts.map(s => s.id)).size !== d.shifts.length) throw new Error('The file contains invalid or duplicate shift records. Your current data has not changed.');
  if (d.active) { const a = d.active as { start: string; notes: string[] }; if (typeof a.start !== 'string' || !Number.isFinite(Date.parse(a.start)) || !Array.isArray(a.notes) || !a.notes.every(n => typeof n === 'string')) throw new Error('The running shift is invalid.'); }
  if (d.payroll && (typeof d.payroll !== 'object' || ['name','number','email'].some(k => typeof (d.payroll as Record<string, unknown>)[k] !== 'string'))) throw new Error('Invalid payroll details.');
  if (d.dayDetails && (typeof d.dayDetails !== 'object' || Array.isArray(d.dayDetails) || Object.entries(d.dayDetails).some(([k,v]) => !/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object' || Object.values(v).some(t => typeof t !== 'string')))) throw new Error('Invalid daily remarks.');
  if (d.workZone) { if (typeof d.workZone !== 'string') throw new Error('Invalid work timezone.'); new Intl.DateTimeFormat('en', { timeZone: d.workZone }); }
  if (d.noteDraft !== undefined && typeof d.noteDraft !== 'string') throw new Error('Invalid note draft.');
  if (d.submissions !== undefined && !Array.isArray(d.submissions)) throw new Error('Invalid email records.');
}
export function decodeSubmissions(values: unknown[] = []): Submission[] {
  return values.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Invalid email backup.');
    const r = value as Record<string, unknown>, report = r.report as WeeklyReport;
    if (['id','week','fingerprint','recipient','sender','subject','message','filename','createdAt','attachment'].some(k => typeof r[k] !== 'string') || !['reviewed','sent','sending','uncertain'].includes(String(r.status)) || !Number.isFinite(Date.parse(String(r.createdAt))) || !report || typeof report.title !== 'string' || typeof report.monday !== 'string' || typeof report.sunday !== 'string' || typeof report.zone !== 'string' || typeof report.includesNotes !== 'boolean' || !Number.isFinite(report.total) || !Array.isArray(report.rows) || !Array.isArray(report.remarks) || !report.profile || ['name','number','email'].some(k => typeof (report.profile as Record<string,unknown>)[k] !== 'string') || report.rows.some(row => !row || !Number.isFinite(row.minutes) || ['day','date','start','end','syg','fri','sh','andet'].some(k => typeof (row as Record<string,unknown>)[k] !== 'string')) || report.remarks.some(row => !row || ['day','date','text'].some(k => typeof (row as Record<string,unknown>)[k] !== 'string'))) throw new Error('The backup contains invalid email records. Nothing was restored.');
    const encoded = String(r.attachment);
    if (!/^data:application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid saved attachment.');
    const bytes = Uint8Array.from(atob(encoded.split(',')[1]), c => c.charCodeAt(0));
    return { ...(r as unknown as Submission), attachment: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
  });
}
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('routehours', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('submissions', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(new Error('Device storage could not open. Your existing data is preserved.')); };
  });
}
export async function loadState<T>(): Promise<{ data: T | null; revision: number }> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction('state').objectStore('state').get('app'); request.onsuccess = () => resolve(request.result || { data: null, revision: 0 }); request.onerror = () => reject(request.error); });
}
export async function saveState(data: unknown, expected: number, receipts: Submission[] = []): Promise<number> {
  validateBackup(data);
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state','submissions'], 'readwrite'), store = tx.objectStore('state'); let conflict = false;
    const request = store.get('app'); request.onsuccess = () => {
      if ((request.result?.revision || 0) !== expected) { conflict = true; tx.abort(); return; }
      store.put({ data, revision: expected + 1 }, 'app');
      for (const receipt of receipts) {
        const existing = tx.objectStore('submissions').get(receipt.id);
        existing.onsuccess = () => { if (!existing.result) tx.objectStore('submissions').put(receipt); };
      }
    };
    tx.oncomplete = () => resolve(expected + 1);
    tx.onabort = tx.onerror = () => reject(new Error(conflict ? 'Another tab changed your records. Save a backup of this screen, then reload to use the latest records.' : 'Could not save to this device. Download a backup before closing.'));
  });
}
export async function saveSubmission(value: Submission) {
  const db = await database();
  return new Promise<void>((resolve, reject) => { const tx = db.transaction('submissions', 'readwrite'); tx.objectStore('submissions').put(value); tx.oncomplete = () => { window.dispatchEvent(new Event('routehours:submissions')); resolve(); }; tx.onerror = tx.onabort = () => reject(new Error('The email record could not be saved. Check Gmail Sent before sending again.')); });
}
// Claim a send in one transaction so two tabs cannot email the same report at once.
export async function beginSubmission(value: Submission) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('submissions','readwrite'), store = tx.objectStore('submissions'); let conflict = false;
    const request = store.getAll();
    request.onsuccess = () => {
      if (request.result.some((r: Submission) => r.week === value.week && (r.status === 'sending' || r.status === 'uncertain'))) { conflict = true; tx.abort(); return; }
      store.put(value);
    };
    tx.oncomplete = () => { window.dispatchEvent(new Event('routehours:submissions')); resolve(); };
    tx.onerror = tx.onabort = () => reject(new Error(conflict ? 'Another send for this week is in progress or unconfirmed. Close this sheet, reopen it and check Gmail Sent.' : 'Could not save the email record. Nothing was sent.'));
  });
}
export async function allSubmissions(): Promise<Submission[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction('submissions').objectStore('submissions').getAll(); request.onsuccess = () => resolve(request.result.sort((a: Submission,b: Submission) => b.createdAt.localeCompare(a.createdAt))); request.onerror = () => reject(request.error); });
}
export function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
