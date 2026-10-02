import assert from 'node:assert/strict';
import test from 'node:test';
import {createBackup, parseBackupText, MAX_BACKUP_BYTES} from './backup.ts';
import {decodeSubmissions, validateBackup, type Submission} from './storage.ts';
import {buildWeeklyReport} from './timesheet.ts';
import {DEFAULT_TEMPLATES} from './templates.ts';

test('complete backups preserve hours, draft, templates and frozen attachment bytes while excluding credentials', async () => {
  const shifts=[{id:'am',start:'2026-09-28T05:00:00Z',end:'2026-09-28T07:00:00Z',notes:['Dansk note — ملاحظة']}];
  const payroll={name:'Worker',number:'00123',email:'recipient@example.com'};
  const source={shifts,active:{start:'2026-10-02T06:00:00Z',notes:['Keep this']},noteDraft:'Unfinished note',payroll,dayDetails:{'2026-09-29':{fri:'X',remarks:'Private remark'}},workZone:'Europe/Copenhagen',templates:DEFAULT_TEMPLATES,geminiApiKey:'PRIVATE_GEMINI',groqApiKey:'PRIVATE_GROQ',accessCode:'PRIVATE_CODE',googleClientId:'PRIVATE_CLIENT'};
  const report=buildWeeklyReport(shifts,'2026-09-28',payroll,source.dayDetails,false);
  const attachment=new Blob([new Uint8Array([0,1,2,127,128,255,80,75])]);
  const receipt:Submission={id:'receipt',week:report.monday,report,fingerprint:'frozen',recipient:payroll.email,sender:'worker@example.com',subject:'Hours',message:'Attached',filename:'hours.xlsx',attachment,createdAt:'2026-10-02T10:00:00Z',status:'sent',gmailId:'confirmed'};
  const backup=await createBackup(source,[receipt],'2026-10-02T11:00:00Z');
  const text=await backup.blob.text(), restored=parseBackupText(text);
  for(const secret of ['PRIVATE_GEMINI','PRIVATE_GROQ','PRIVATE_CODE','PRIVATE_CLIENT']) assert.ok(!text.includes(secret));
  assert.deepEqual(restored.shifts,source.shifts);
  assert.deepEqual(restored.active,source.active);
  assert.equal(restored.noteDraft,'Unfinished note');
  assert.equal(restored.payroll?.number,'00123');
  assert.deepEqual(restored.templates,DEFAULT_TEMPLATES);
  assert.deepEqual(restored.dayDetails,source.dayDetails);
  const [originalEmail]=decodeSubmissions(restored.submissions);
  assert.equal(originalEmail.gmailId,'confirmed');
  assert.deepEqual(originalEmail.report,report);
  assert.deepEqual(new Uint8Array(await originalEmail.attachment.arrayBuffer()), new Uint8Array(await attachment.arrayBuffer()));
});

test('old backup formats remain readable and malformed or future backups are refused', () => {
  for(const version of [undefined,1,2,3]) assert.doesNotThrow(()=>validateBackup({version,shifts:[]}));
  assert.throws(()=>parseBackupText('{bad json'), /valid JSON/);
  assert.throws(()=>parseBackupText(JSON.stringify({version:4,shifts:[]})), /version/);
  assert.throws(()=>parseBackupText(JSON.stringify({shifts:[],templates:[{id:'bad',name:'Bad',start:'25:00',end:'09:00'}]})), /valid start/);
  assert.throws(()=>parseBackupText(JSON.stringify({shifts:[],createdAt:'bad'})), /date/);
  assert.throws(()=>parseBackupText(JSON.stringify({shifts:[],submissions:[{}]})), /email records/);
  assert.throws(()=>parseBackupText(' '.repeat(MAX_BACKUP_BYTES+1)), /30 MB/);
});
