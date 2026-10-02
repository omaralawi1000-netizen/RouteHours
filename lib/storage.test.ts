import assert from 'node:assert/strict';
import test from 'node:test';
import { beginSubmission, type Submission } from './storage.ts';
import { buildWeeklyReport } from './timesheet.ts';

test('a send claim checks fresh receipts and requires explicit authorization to resend', async () => {
  // The browser supplies transaction scheduling. This harness supplies a fresh
  // receipt read at request completion and records writes and aborts.
  let records: Submission[] = [], writes = 0;
  type Read = { result: Submission[]; onsuccess: (() => void) | null };
  type Transaction = { oncomplete: (() => void) | null; onabort: (() => void) | null; abort: () => void; objectStore: () => { getAll: () => Read; put: (r: Submission) => void } };
  const db = {
    transaction() {
      let aborted = false;
      const tx: Transaction = {
        oncomplete: null, onabort: null,
        abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
        objectStore() {
          return {
            getAll() {
              const request: Read = { result: [], onsuccess: null };
              queueMicrotask(() => {
                request.result = records.slice(); request.onsuccess?.();
                if (!aborted) queueMicrotask(() => tx.oncomplete?.());
              });
              return request;
            },
            put(r: Submission) { writes++; records = [...records.filter(v => v.id !== r.id), r]; },
          };
        },
      };
      return tx;
    },
  };
  const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() {
    const request = { result: db, onsuccess: null as (() => void) | null };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  const report = buildWeeklyReport([], '2026-09-28', { name: 'Test', number: '001', email: 'test@example.com' }, {}, false);
  const next: Submission = { id: 'next', week: report.monday, report, fingerprint: 'same-report', recipient: 'test@example.com', sender: 'worker@example.com', subject: 'Hours', message: 'Attached', filename: 'hours.xlsx', attachment: new Blob(['example']), createdAt: '2026-10-02T10:00:00Z', status: 'sending' };
  const sent: Submission = { ...next, id: 'sent', status: 'sent', gmailId: 'confirmed' };
  try {
    // Another tab completes its send after this caller's cached check.
    const lateClaim = beginSubmission(next);
    records = [sent];
    await assert.rejects(lateClaim, /already sent.*confirm sending another copy/);
    assert.equal(writes, 0);
    assert.deepEqual(records, [sent]);

    await beginSubmission(next, true);
    assert.equal(writes, 1);
    assert.equal(records.find(r => r.id === 'sent')?.gmailId, 'confirmed');
    assert.equal(records.find(r => r.id === 'next')?.status, 'sending');

    for (const status of ['sending', 'uncertain'] as const) {
      records = [{ ...sent, status }];
      await assert.rejects(beginSubmission(next, true), /in progress or unconfirmed/);
      assert.equal(writes, 1, 'resend authorization must not bypass a pending send');
    }

    records = [sent];
    await beginSubmission({ ...next, fingerprint: 'changed-report' });
    assert.equal(writes, 2, 'a changed report is allowed without resend authorization');
  } finally {
    if (originalIndexedDB) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB); else Reflect.deleteProperty(globalThis, 'indexedDB');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
