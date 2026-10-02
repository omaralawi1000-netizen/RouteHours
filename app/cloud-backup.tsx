"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, CloudUpload, LoaderCircle, RefreshCw } from 'lucide-react';
import { GOOGLE_EMAIL_SCOPE, GOOGLE_FILE_SCOPE, readGoogleEmail, requestGoogleToken, type GoogleAccount } from '@/lib/google-auth';
import { listCloudBackups, readCloudBackup, uploadCloudBackup, DriveBackupError, type CloudBackupFile } from '@/lib/cloud-backup';
import { createBackup } from '@/lib/backup';

const STAMP_KEY = 'routehours:last-drive-backup';
type Stamp = { email: string; createdAt: string; id: string };
type Props = { clientId: string; online: boolean; onSettings: () => void; makeBackup: () => ReturnType<typeof createBackup>; onRestore: (value: unknown) => void };
const format = (value: string) => new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

export default function CloudBackup({clientId, online, onSettings, makeBackup, onRestore}: Props) {
  const [account, setAccount] = useState<GoogleAccount|null>(null), [files, setFiles] = useState<CloudBackupFile[]|null>(null), [nextPage, setNextPage] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState(''), [last, setLast] = useState<Stamp|null>(null);
  const request = useRef<AbortController|null>(null), generation = useRef(0), activeOperation = useRef(false);
  useEffect(() => {
    try {const value=JSON.parse(localStorage.getItem(STAMP_KEY)||'null');if(value&&typeof value.email==='string'&&typeof value.id==='string'&&Number.isFinite(Date.parse(value.createdAt)))setLast(value);}catch{/* Last-backup display is optional. */}
  },[]);
  useEffect(() => {generation.current++;request.current?.abort();activeOperation.current=false;setAccount(null);setFiles(null);setNextPage('');setBusy('');setError('');return () => {generation.current++;request.current?.abort();};},[clientId]);
  useEffect(() => {
    if(!account)return;
    const timer=setTimeout(()=>{setAccount(null);setError('Your Drive session expired. Reconnect before backing up or restoring.');},Math.max(0,account.expires-Date.now()));
    return ()=>clearTimeout(timer);
  },[account]);
  function begin(kind: string) {
    if(activeOperation.current)return null;
    const controller=new AbortController(), id=++generation.current;
    request.current=controller;activeOperation.current=true;setBusy(kind);setError('');setStatus('');
    return {controller,id,current:()=>generation.current===id&&!controller.signal.aborted};
  }
  function failed(e: unknown) {if(e instanceof DriveBackupError&&e.reconnect)setAccount(null);setError(e instanceof Error?e.message:'Google Drive could not complete this action.');}
  function finish(operation: NonNullable<ReturnType<typeof begin>>) {if(operation.current()){activeOperation.current=false;request.current=null;setBusy('');}}
  async function connect() {
    if(!online)return;
    if(!clientId){onSettings();return;}
    const operation=begin('connect');if(!operation)return;
    setAccount(null);setFiles(null);setNextPage('');
    try {
      const grant=await requestGoogleToken(clientId,[GOOGLE_FILE_SCOPE,GOOGLE_EMAIL_SCOPE],{signal:operation.controller.signal});
      const email=await readGoogleEmail(grant.token);if(!operation.current())return;
      const connected={...grant,email};setAccount(connected);
      const listed=await listCloudBackups(grant.token,'',operation.controller.signal);if(operation.current()){setFiles(listed.files);setNextPage(listed.nextPageToken);}
    }catch(e){if(operation.current())failed(e);}finally{finish(operation);}
  }
  async function refresh(more=false) {
    if(!account||!online)return;
    const operation=begin('list');if(!operation)return;
    try {const result=await listCloudBackups(account.token,more?nextPage:'',operation.controller.signal);if(operation.current()){setFiles(previous=>more?[...(previous||[]),...result.files.filter(f=>!previous?.some(p=>p.id===f.id))]:result.files);setNextPage(result.nextPageToken);}}
    catch(e){if(operation.current())failed(e);}finally{finish(operation);}
  }
  async function backupNow() {
    if(!account||!online)return;
    const operation=begin('backup');if(!operation)return;
    try {
      const backup=await makeBackup();if(!operation.current())return;
      const uploaded=await uploadCloudBackup(account.token,backup.blob,backup.data.createdAt,operation.controller.signal);if(!operation.current())return;
      const stamp={email:account.email,createdAt:backup.data.createdAt,id:uploaded.id};setLast(stamp);setFiles(previous=>[uploaded,...(previous||[]).filter(f=>f.id!==uploaded.id)]);setStatus('Backup saved to Google Drive.');
      try{localStorage.setItem(STAMP_KEY,JSON.stringify(stamp));}catch{setStatus('Backup saved to Google Drive. This browser could not remember its date.');}
    }catch(e){if(operation.current())failed(e);}finally{finish(operation);}
  }
  async function preview(file: CloudBackupFile) {
    if(!account||!online)return;
    const operation=begin('restore');if(!operation)return;
    try {const data=await readCloudBackup(account.token,file,operation.controller.signal);if(operation.current())onRestore(data);}
    catch(e){if(operation.current())failed(e);}finally{finish(operation);}
  }
  return <div className="setting-block cloud-backup">
    <div className="setting-title"><span className="setting-icon"><Cloud size={19}/></span><div><strong>Cloud backup</strong><p>A saved copy in your Google Drive.</p></div></div>
    <p className="report-hint">Includes hours, notes, templates and saved email files. API keys stay out of backups. Each save creates a new copy.</p>
    {last&&<p className="cloud-last-backup">Last backed up <strong>{format(last.createdAt)}</strong><span>{last.email}</span></p>}
    {account?<><p className="cloud-account">Drive account <strong>{account.email}</strong></p><div className="cloud-actions"><button className="secondary-btn backup-to-drive" disabled={Boolean(busy)||!online} onClick={()=>void backupNow()}>{busy==='backup'?<LoaderCircle className="spin" size={17}/>:<CloudUpload size={17}/>} {busy==='backup'?'Saving copy…':'Back up now'}</button><button className="secondary-btn" disabled={Boolean(busy)||!online} onClick={()=>void refresh()}><RefreshCw size={16}/>{busy==='list'?'Loading…':'Refresh backups'}</button></div><button className="text-action" disabled={Boolean(busy)||!online} onClick={()=>void connect()}>Change Drive account</button></>:<button className="secondary-btn connect-drive" disabled={Boolean(busy)||!online} onClick={()=>void connect()}>{busy==='connect'?<LoaderCircle className="spin" size={17}/>:<Cloud size={17}/>} {busy==='connect'?'Connecting…':clientId?'Connect Google Drive':'Set up Google first'}</button>}
    {!online&&<p className="report-hint" role="status">Go online for cloud backups. Your local hours and downloaded backups still work.</p>}
    {status&&<p className="connection-result success" role="status"><Check size={16}/>{status}</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {account&&files&&<details className="cloud-history" open={files.length===0||undefined}><summary>Saved backups · {files.length}</summary>{files.length?<><p className="report-hint">Preview a copy, then choose Merge or Replace. Opening a preview does not change your records.</p><ul>{files.map(file=><li key={file.id}><div><strong>{format(file.createdTime)}</strong><span>{Math.max(1,Math.ceil(file.size/1024))} KB</span></div><button className="secondary-btn preview-cloud-backup" disabled={Boolean(busy)||!online} onClick={()=>void preview(file)}>{busy==='restore'?'Opening…':'Preview'}</button></li>)}</ul>{nextPage&&<button className="text-action" disabled={Boolean(busy)||!online} onClick={()=>void refresh(true)}>Load older backups</button>}</>:<p className="report-hint">No RouteHours backups found for this account. Tap Back up now to save your first copy.</p>}</details>}
  </div>;
}
