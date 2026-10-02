import assert from 'node:assert/strict';
import test from 'node:test';
import {backupToDrive,dailyBackupDue,lastDriveBackup} from './daily-backup.ts';
import {createBackup} from './backup.ts';

test('daily backup dates follow the work timezone, including midnight and DST',()=>{
  const stamp={email:'worker@example.com',id:'copy',createdAt:'2026-10-02T22:30:00Z'};
  assert.equal(dailyBackupDue(stamp,'2026-10-03','Europe/Copenhagen'),false);
  assert.equal(dailyBackupDue(stamp,'2026-10-02','Europe/Copenhagen'),true);
  assert.equal(dailyBackupDue(null,'2026-10-03','Europe/Copenhagen'),true);
  assert.equal(dailyBackupDue({...stamp,createdAt:'2026-10-25T23:30:00Z'},'2026-10-26','Europe/Copenhagen'),false);
});
test('daily uploads serialize, run once per date/account/client, and leave older copies intact',async t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const values=new Map<string,string>();let uploads=0;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v)}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
  t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
    if(init.method==='POST')return new Response(null,{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test'}});
    uploads++;return new Response(JSON.stringify({id:'copy-'+uploads,name:'Backup',createdTime:new Date().toISOString(),size:'100'}));
  });
  const client='daily.apps.googleusercontent.com',account={token:'fake',email:'worker@example.com',expires:Date.now()+3600000};
  const make=()=>createBackup({shifts:[],active:null,noteDraft:'',payroll:{name:'',number:'',email:''},dayDetails:{},workZone:'Europe/Copenhagen',templates:[]},[]);
  try{
    const [first,second]=await Promise.all([backupToDrive(client,account,make,'Europe/Copenhagen',true),backupToDrive(client,account,make,'Europe/Copenhagen',true)]);
    assert.ok(first);assert.equal(second,null);assert.equal(uploads,1);
    assert.equal(await backupToDrive(client,account,make,'Europe/Copenhagen',true),null);assert.equal(uploads,1);
    await backupToDrive(client,account,make,'Europe/Copenhagen',false);assert.equal(uploads,2,'manual copies remain available');
    const saved=lastDriveBackup(client,account.email)!;
    assert.equal(saved.clientId,client);assert.equal(saved.id,'copy-2');
    assert.equal(lastDriveBackup('other-client',account.email),null);
    await backupToDrive(client,{...account,email:'other@example.com'},make,'Europe/Copenhagen',true);assert.equal(uploads,3);
    assert.equal(lastDriveBackup(client,account.email)?.id,'copy-2');
    await assert.rejects(backupToDrive(client,{...account,expires:Date.now()-1},make,'Europe/Copenhagen',true),/needs renewing/);
    assert.equal(uploads,3);
  }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window')}
});
test('failed daily uploads do not mark the day as protected',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:{message:'expired'}}),{status:401}));
  const make=()=>createBackup({shifts:[],active:null,noteDraft:'',payroll:{name:'',number:'',email:''},dayDetails:{},workZone:'Europe/Copenhagen',templates:[]},[]);
  await assert.rejects(backupToDrive('failed.apps.googleusercontent.com',{token:'fake',email:'worker@example.com',expires:Date.now()+10000},make,'Europe/Copenhagen',true),/expired/);
  assert.equal(lastDriveBackup('failed.apps.googleusercontent.com','worker@example.com'),null);
});
