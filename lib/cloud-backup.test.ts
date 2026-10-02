import assert from 'node:assert/strict';
import test from 'node:test';
import {listCloudBackups,uploadCloudBackup,readCloudBackup,DriveBackupError} from './cloud-backup.ts';
import {MAX_BACKUP_BYTES} from './backup.ts';

const file={id:'backup-id',name:'RouteHours backup.json',createdTime:'2026-10-02T11:00:00Z',size:100};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

test('Drive access lists only app-created JSON backups and retains pagination', async t => {
  t.mock.method(globalThis,'fetch',async(url: string, options:RequestInit)=>{
    const query=new URL(url).searchParams;
    assert.match(query.get('q')!, /trashed = false.*mimeType = 'application\/json'.*appProperties.*routehoursBackup/);
    assert.equal(query.get('pageToken'),'older-page');
    assert.equal(query.get('pageSize'),'20');
    assert.equal(query.get('orderBy'),'createdTime desc');
    assert.equal((options.headers as Record<string,string>).authorization,'Bearer private-token');
    return json({files:[{...file,size:'100'}],nextPageToken:'next-page'});
  });
  assert.deepEqual(await listCloudBackups('private-token','older-page'),{files:[file],nextPageToken:'next-page'});
});

test('each backup creates a dated copy and uploads exact bytes without modifying other files', async t => {
  const calls:{url:string;options:RequestInit}[]=[];
  const blob=new Blob(['{"shifts":[],"note":"مرحبا"}'],{type:'application/json'});
  t.mock.method(globalThis,'fetch',async(url:string,options:RequestInit)=>{
    calls.push({url,options});
    if(options.method==='POST')return new Response(null,{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test'}});
    return json({...file,size:String(blob.size)});
  });
  const saved=await uploadCloudBackup('token',blob,'2026-10-02T11:00:00Z');
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(c=>c.options.method),['POST','PUT']);
  const metadata=JSON.parse(String(calls[0].options.body));
  assert.equal(metadata.name,'RouteHours-backup-2026-10-02T11-00-00-000Z.json');
  assert.deepEqual(metadata.appProperties,{routehoursBackup:'1'});
  assert.equal((calls[0].options.headers as Record<string,string>)['x-upload-content-length'],String(blob.size));
  assert.equal(await (calls[1].options.body as Blob).text(),await blob.text());
  assert.equal(saved.size,blob.size);
  assert.ok(calls.every(c=>(c.options.headers as Record<string,string>).authorization==='Bearer token'));
});

test('unexpected upload destinations never receive credentials or backup payload', async t => {
  for(const location of ['https://other.example/upload?uploadType=resumable','https://www.googleapis.com/other?uploadType=resumable','https://www.googleapis.com/upload/drive/v3/files?uploadType=media']) {
    let calls=0;
    t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{headers:{location}})});
    await assert.rejects(uploadCloudBackup('secret',new Blob(['private-data']),'2026-10-02'), /unexpected upload address/);
    assert.equal(calls,1);
    t.mock.restoreAll();
  }
});

test('Drive permission and network failures give recoverable errors without automatic retry', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return json({error:{message:'Expired'}},401)});
  await assert.rejects(listCloudBackups('token'),e=>e instanceof DriveBackupError&&e.reconnect);
  assert.equal(calls,1);
  t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>json({error:{message:'Google Drive API has not been used in project or is disabled'}},403));
  await assert.rejects(listCloudBackups('token'), /Enable Google Drive API/);
  t.mock.restoreAll();
  calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new TypeError('Network lost')});
  await assert.rejects(uploadCloudBackup('token',new Blob(['private']),'2026-10-02'), /refresh the backup list/);
  assert.equal(calls,1);
});

test('restore downloads and validates a backup without writing any records', async t => {
  const body={version:3,shifts:[],templates:[],createdAt:'2026-10-02T11:00:00Z'};
  t.mock.method(globalThis,'fetch',async(url:string,options:RequestInit)=>{
    assert.equal(url,'https://www.googleapis.com/drive/v3/files/backup-id?alt=media');
    assert.equal(options.method,undefined);
    return json(body);
  });
  assert.deepEqual(await readCloudBackup('token',file),body);
  t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>json({shifts:'invalid'}));
  await assert.rejects(readCloudBackup('token',file), /invalid.*shift records/);
});

test('backup size is bounded before upload and while streaming downloads', async t => {
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null)});
  await assert.rejects(uploadCloudBackup('token',new Blob([new Uint8Array(MAX_BACKUP_BYTES+1)]),'2026-10-02'), /30 MB/);
  await assert.rejects(readCloudBackup('token',{...file,size:MAX_BACKUP_BYTES+1}), /30 MB/);
  assert.equal(calls,0);
  t.mock.restoreAll();
  let cancelled=false;
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_BACKUP_BYTES));c.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}})));
  await assert.rejects(readCloudBackup('token',file), /30 MB/);
  assert.ok(cancelled,'oversized response is cancelled even when file metadata understates its size');
});
