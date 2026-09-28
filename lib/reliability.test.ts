import assert from 'node:assert/strict';
import test from 'node:test';
import { dayLedger, periodMinutes, dateInZone, zonedInstant, shiftWarnings } from './ledger.ts';
import { buildWeeklyReport } from './timesheet.ts';
import { validateBackup, reportFingerprint } from './storage.ts';
import { proposedShifts, validateVoicePlan } from './voice-plan.ts';
import type { Shift } from './time.ts';
const profile = { name:'Test', number:'001', email:'test@example.com' };
const shift: Shift = { id:'one', start:'2026-09-27T23:30:00+02:00', end:'2026-09-28T00:30:00+02:00', notes:['Private'] };
test('dashboard and weekly file agree across the week boundary in any device timezone', () => {
  process.env.TZ = 'America/New_York';
  const report = buildWeeklyReport([shift],'2026-09-28',profile,{},false,'Europe/Copenhagen');
  assert.equal(report.total,30);
  assert.equal(periodMinutes([shift],'2026-09-28','2026-10-05','Europe/Copenhagen'),report.total);
  assert.equal(report.rows[0].start,'00:00'); assert.equal(report.rows[0].end,'00:30');
});
test('DST changes preserve elapsed minutes and ambiguous edits are rejected', () => {
  const fall={...shift,start:'2026-10-25T01:00:00+02:00',end:'2026-10-25T04:00:00+01:00'};
  assert.equal(dayLedger([fall],'2026-10-25')[0].minutes,240);
  const spring={...shift,start:'2026-03-29T01:00:00+01:00',end:'2026-03-29T04:00:00+02:00'};
  assert.equal(dayLedger([spring],'2026-03-29')[0].minutes,120);
  assert.throws(() => zonedInstant('2026-03-29T02:30','Europe/Copenhagen',true),/does not exist/);
  assert.throws(() => zonedInstant('2026-10-25T02:30','Europe/Copenhagen',true),/occurs twice/);
  assert.equal(dateInZone(zonedInstant('2026-12-31T23:30')),'2026-12-31');
});
test('cumulative rounding is conserved across a year boundary', () => {
  const s={...shift,start:'2026-12-31T23:59:40+01:00',end:'2027-01-01T00:01:20+01:00'};
  assert.equal(periodMinutes([s],'2026-12-31','2027-01-02'),2);
});
test('overlaps are flagged including nested shifts; adjacent shifts are valid', () => {
  const a={...shift,start:'2026-09-28T07:00Z',end:'2026-09-28T12:00Z'};
  const b={...a,id:'two',start:'2026-09-28T08:00Z',end:'2026-09-28T09:00Z'};
  const c={...a,id:'three',start:'2026-09-28T10:00Z',end:'2026-09-28T11:00Z'};
  assert.equal(shiftWarnings([a,b,c]).length,2);
  assert.equal(shiftWarnings([a,{...a,id:'four',start:a.end,end:'2026-09-28T13:00Z'}]).length,0);
});
test('backup rejects malformed records rather than silently dropping them', () => {
  assert.doesNotThrow(() => validateBackup({shifts:[shift]}));
  for (const value of [{shifts:[{...shift,notes:'text'}]},{shifts:[{...shift,end:'bad'}]},{shifts:[shift,shift]},{shifts:[],active:{start:'bad',notes:[]}},{shifts:[],dayDetails:{'bad':{remarks:42}}}]) assert.throws(() => validateBackup(value));
});
test('receipt fingerprints track exported content and preserve excluded notes', () => {
  const old=buildWeeklyReport([shift],'2026-09-28',profile,{},false);
  assert.equal(reportFingerprint(old),reportFingerprint(buildWeeklyReport([{...shift,notes:['Changed private note']}],'2026-09-28',{...profile,email:'other@example.com'},{},false)));
  assert.notEqual(reportFingerprint(old),reportFingerprint(buildWeeklyReport([{...shift,end:'2026-09-28T01:00:00+02:00'}],'2026-09-28',profile,{},false)));
});
test('voice proposals cannot edit unknown IDs, reverse time or silently resolve DST ambiguity', () => {
  const base={action:'edit' as const,explanation:'Fix',entries:[{id:'missing',start:'2026-09-28T07:00',end:'2026-09-28T09:00'}]};
  assert.throws(() => proposedShifts(base,[shift],'Europe/Copenhagen'),/missing/);
  assert.throws(() => proposedShifts({...base,action:'create',entries:[{id:'',start:'2026-09-28T09:00',end:'2026-09-28T07:00'}]},[],'Europe/Copenhagen'),/Check/);
  assert.throws(() => validateVoicePlan({action:'sendEmail',entries:[],explanation:''}));
  const proposed=proposedShifts({...base,action:'create'},[],'Europe/Copenhagen');
  assert.equal(proposed[0].start,'2026-09-28T05:00:00.000Z');
  assert.deepEqual(proposedShifts({action:'clarify',explanation:'AM or PM?',entries:[]},[],'Europe/Copenhagen'),[]);
});
