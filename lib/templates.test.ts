import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TEMPLATES, templateShift, validateTemplates } from './templates.ts';
import { dateInZone, timeInZone, periodMinutes } from './ledger.ts';

test('templates create separate editable drafts in the work zone without logging hours', () => {
  const original = structuredClone(DEFAULT_TEMPLATES), records = [];
  const am = templateShift(DEFAULT_TEMPLATES[0], '2026-09-28', 'Europe/Copenhagen');
  const pm = templateShift(DEFAULT_TEMPLATES[1], '2026-09-28', 'Europe/Copenhagen');
  assert.notEqual(am.id, pm.id);
  assert.deepEqual(DEFAULT_TEMPLATES, original);
  assert.equal(records.length, 0);
  assert.equal(am.start, '2026-09-28T05:00:00.000Z');
  assert.equal(timeInZone(pm.end), '15:00');
  assert.deepEqual(am.notes, []);
  assert.equal(periodMinutes([am,pm], '2026-09-28', '2026-09-29'), 240);
});

test('overnight templates use the following calendar day and elapsed time', () => {
  const overnight = {id:'night', name:'Night', start:'23:00', end:'01:00'};
  const shift = templateShift(overnight, '2026-09-30', 'Europe/Copenhagen');
  assert.equal(dateInZone(shift.start), '2026-09-30');
  assert.equal(dateInZone(shift.end), '2026-10-01');
  assert.equal((Date.parse(shift.end)-Date.parse(shift.start))/60000, 120);
});

test('templates reject nonexistent or ambiguous clock-change times and invalid calendar dates', () => {
  const template = {id:'test',name:'Test',start:'02:30',end:'04:00'};
  assert.throws(()=>templateShift(template,'2026-03-29','Europe/Copenhagen'), /does not exist/);
  assert.throws(()=>templateShift(template,'2026-10-25','Europe/Copenhagen'), /occurs twice/);
  for(const date of ['2026-99-99','2026-02-30','bad','']) assert.throws(()=>templateShift(template,date,'Europe/Copenhagen'), /valid date/);
  assert.throws(()=>templateShift({...template,start:'03:00',end:'02:30'},'2026-10-24','Europe/Copenhagen'), /occurs twice/);
});

test('invalid drafts cannot be persisted as templates', () => {
  const template = DEFAULT_TEMPLATES[0];
  assert.deepEqual(validateTemplates([{...template,name:'  Morning  '}]), [template]);
  for(const change of [{name:' '},{start:'24:00'},{end:'12:70'},{end:'07:00'},{id:'../bad'}]) assert.throws(()=>validateTemplates([{...template,...change}]));
  assert.throws(()=>validateTemplates([template,template]), /unique ID/);
  assert.throws(()=>validateTemplates(Array.from({length:9},(_,i)=>({...template,id:String(i)}))), /eight/);
  assert.deepEqual(validateTemplates([]), []);
});
