import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStoredData, UNREADABLE_DATA } from './stored-data.ts';
import { DEFAULT_TEMPLATES } from './templates.ts';

test('empty saved data becomes a complete default snapshot', () => {
  const data = parseStoredData(null);
  assert.equal(data.workZone, 'Europe/Copenhagen');
  assert.deepEqual(data.shifts, []);
  assert.equal(data.active, null);
  assert.equal(data.noteDraft, '');
  assert.equal(data.themeMode, 'system');
  assert.equal(data.dictationLanguage, 'auto');
  assert.equal(data.weeklyGoalHours, 0);
  assert.deepEqual(data.payroll, { name: '', number: '', email: '' });
  assert.deepEqual(data.templates, DEFAULT_TEMPLATES);
});

test('missing fields fall back to defaults without touching the rest', () => {
  const data = parseStoredData({ shifts: [{ id: 'a', start: '2026-11-10T06:00:00.000Z', end: '2026-11-10T08:00:00.000Z', notes: [] }], payroll: { name: 'Omar', number: '7', email: 'boss@example.com' } });
  assert.equal(data.shifts.length, 1);
  assert.equal(data.payroll.name, 'Omar');
  assert.equal(data.groqApiKey, '');
  assert.equal(data.aiEnabled, false);
});

test('an old Gemini key saved as an access code moves to the Gemini key field', () => {
  const data = parseStoredData({ shifts: [], accessCode: 'AIzaOldKey' });
  assert.equal(data.accessCode, '');
  assert.equal(data.geminiApiKey, 'AIzaOldKey');
  const server = parseStoredData({ shifts: [], accessCode: 'server-code' });
  assert.equal(server.accessCode, 'server-code');
  assert.equal(server.geminiApiKey, '');
});

test('the weekly goal is clamped to 0–80 hours and must be a number', () => {
  assert.equal(parseStoredData({ shifts: [], weeklyGoalHours: 200 }).weeklyGoalHours, 80);
  assert.equal(parseStoredData({ shifts: [], weeklyGoalHours: -5 }).weeklyGoalHours, 0);
  assert.equal(parseStoredData({ shifts: [], weeklyGoalHours: '20' }).weeklyGoalHours, 0);
  assert.equal(parseStoredData({ shifts: [], weeklyGoalHours: Number.NaN }).weeklyGoalHours, 0);
});

test('a note draft is kept only while a shift runs, and capped at 2000 characters', () => {
  assert.equal(parseStoredData({ shifts: [], noteDraft: 'left over' }).noteDraft, '');
  const running = parseStoredData({ shifts: [], active: { start: '2026-11-10T06:00:00.000Z', notes: [] }, noteDraft: 'x'.repeat(2500) });
  assert.equal(running.noteDraft.length, 2000);
});

test('unknown theme and dictation values fall back safely', () => {
  const data = parseStoredData({ shifts: [], themeMode: 'neon', dictationLanguage: 'fr' });
  assert.equal(data.themeMode, 'system');
  assert.equal(data.dictationLanguage, 'auto');
});

test('invalid records are refused with a message that says the data is preserved', () => {
  assert.throws(() => parseStoredData({ shifts: [{ id: 'a', start: 'nope', end: 'nope', notes: [] }] }), { message: UNREADABLE_DATA });
  assert.throws(() => parseStoredData({ shifts: 'not a list' }), { message: UNREADABLE_DATA });
});
