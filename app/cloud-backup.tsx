"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, CloudUpload, LoaderCircle, RefreshCw } from 'lucide-react';
import { GOOGLE_EMAIL_SCOPE, GOOGLE_FILE_SCOPE, authorizeGoogleAccount } from '@/lib/google-auth';
import { clearGoogleSession } from '@/lib/google-session';
import { useGoogleSession } from './use-google-session';
import { listCloudBackups, readCloudBackup, DriveBackupError, type CloudBackupFile } from '@/lib/cloud-backup';
import { backupToDrive, lastDriveBackup, DRIVE_BACKUP_EVENT, type BackupStamp } from '@/lib/daily-backup';
import { createBackup } from '@/lib/backup';

type Props = { clientId: string; online: boolean; zone:string; daily:{enabled:boolean;onToggle:()=>void;saving:boolean;message:string;error:string}; onSettings: () => void; makeBackup: () => ReturnType<typeof createBackup>; onRestore: (value: unknown) => void };
const format = (value: string) => new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

export default function CloudBackup({clientId, online, zone, daily, onSettings, makeBackup, onRestore}: Props) {
  const {account,savedEmail} = useGoogleSession(clientId,'drive');
  const [files, setFiles] = useState<CloudBackupFile[]|null>(null), [nextPage, setNextPage] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState(''), [last, setLast] = useState<BackupStamp|null>(null);
  const request = useRef<AbortController|null>(null), generation = useRef(0), activeOperation = useRef(false);
  useEffect(() => {
    const update=()=>{setLast(lastDriveBackup(clientId,account?.email||savedEmail));if(account&&online&&!activeOperation.current)void refresh();};
    setLast(lastDriveBackup(clientId,account?.email||savedEmail));window.addEventListener(DRIVE_BACKUP_EVENT,update);
    return()=>window.removeEventListener(DRIVE_BACKUP_EVENT,update);
  },[clientId,account?.email,account?.token,savedEmail,online]);
  useEffect(() => {generation.current++;request.current?.abort();activeOperation.current=false;setFiles(null);setNextPage('');setBusy('');setError('');return () => {generation.current++;request.current?.abort();};},[clientId]);
  useEffect(() => {
    if(!account||!online||files!==null||activeOperation.current)return;
    const operation=begin('list');if(!operation)return;
    void listCloudBackups(account.token,'',operation.controller.signal).then(result=>{if(operation.current()){setFiles(result.files);setNextPage(result.nextPageToken);}}).catch(e=>{if(operation.current())failed(e);}).finally(()=>finish(operation));
  },[clientId,account?.token,online]);
  function begin(kind: string) {
    if(activeOperation.current)return null;
    const controller=new AbortController(), id=++generation.current;
    request.current=controller;activeOperation.current=true;setBusy(kind);setError('');setStatus('');
    return {controller,id,current:()=>generation.current===id&&!controller.signal.aborted};
  }
  function failed(e: unknown) {if(e instanceof DriveBackupError&&e.reconnect)clearGoogleSession(clientId,'drive');setError(e instanceof Error?e.message:'Google Drive could not complete this action.');}
  function finish(operation: NonNullable<ReturnType<typeof begin>>) {if(operation.current()){activeOperation.current=false;request.current=null;setBusy('');}}
  async function connect(changeAccount=false) {
    if(!online)return;
    if(!clientId){onSettings();return;}
    const operation=begin('connect');if(!operation)return;
    setFiles(null);setNextPage('');
    try {
      const grant=await authorizeGoogleAccount(clientId,'drive',[GOOGLE_FILE_SCOPE,GOOGLE_EMAIL_SCOPE],{signal:operation.controller.signal,forceAccountChoice:changeAccount});if(!operation.current())return;
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
      const result=await backupToDrive(clientId,account,makeBackup,zone,false,operation.controller.signal);if(!operation.current()||!result)return;
      setLast(result.stamp);setFiles(previous=>[result.file,...(previous||[]).filter(f=>f.id!==result.file.id)]);setStatus('Backup saved to Google Drive.');
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
    <div className="daily-backup-setting"><div><strong>Daily backup</strong><p>{daily.message}</p></div><button type="button" className={'toggle '+(daily.enabled?'on':'')} role="switch" aria-label="Daily Google Drive backup" aria-checked={daily.enabled} onClick={daily.onToggle}><span/></button></div>
    <p className="report-hint">Once a day when you open or return to RouteHours, after your records are saved. The app needs internet and valid Google access; it cannot run while fully closed.</p>
    {daily.error&&<p className="form-error" role="alert">{daily.error} Use Back up now to retry.</p>}
    {last&&<p className="cloud-last-backup">Last backed up <strong>{format(last.createdAt)}</strong><span>{last.email}</span></p>}
    {account?<><p className="cloud-account">Drive account <strong>{account.email}</strong></p><div className="cloud-actions"><button className="secondary-btn backup-to-drive" disabled={Boolean(busy)||!online} onClick={()=>void backupNow()}>{busy==='backup'?<LoaderCircle className="spin" size={17}/>:<CloudUpload size={17}/>} {busy==='backup'?'Saving copy…':'Back up now'}</button><button className="secondary-btn" disabled={Boolean(busy)||!online} onClick={()=>void refresh()}><RefreshCw size={16}/>{busy==='list'?'Loading…':'Refresh backups'}</button></div><button className="text-action" disabled={Boolean(busy)||!online} onClick={()=>void connect(true)}>Change Drive account</button></>:<button className="secondary-btn connect-drive" disabled={Boolean(busy)||!online} onClick={()=>void connect()}>{busy==='connect'?<LoaderCircle className="spin" size={17}/>:<Cloud size={17}/>} {busy==='connect'?'Connecting…':clientId?(savedEmail?'Continue with Google Drive':'Connect Google Drive'):'Set up Google first'}</button>}
    {!account&&savedEmail&&<><p className="cloud-account">Saved Drive account<strong>{savedEmail}</strong></p><p className="report-hint">Your account and client ID are remembered. Continue to renew Google access.</p><button className="text-action" disabled={Boolean(busy)||!online} onClick={()=>void connect(true)}>Use another Drive account</button></>}
    {!online&&<p className="report-hint" role="status">Go online for cloud backups. Your local hours and downloaded backups still work.</p>}
    {status&&<p className="connection-result success" role="status"><Check size={16}/>{status}</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {account&&files&&<details className="cloud-history" open={files.length===0||undefined}><summary>Saved backups · {files.length}</summary>{files.length?<><p className="report-hint">Preview a copy, then choose Merge or Replace. Opening a preview does not change your records.</p><ul>{files.map(file=><li key={file.id}><div><strong>{format(file.createdTime)}</strong><span>{Math.max(1,Math.ceil(file.size/1024))} KB</span></div><button className="secondary-btn preview-cloud-backup" disabled={Boolean(busy)||!online} onClick={()=>void preview(file)}>{busy==='restore'?'Opening…':'Preview'}</button></li>)}</ul>{nextPage&&<button className="text-action" disabled={Boolean(busy)||!online} onClick={()=>void refresh(true)}>Load older backups</button>}</>:<p className="report-hint">No RouteHours backups found for this account. Tap Back up now to save your first copy.</p>}</details>}
  </div>;
}
