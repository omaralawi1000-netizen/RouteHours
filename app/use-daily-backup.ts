"use client";
import { useEffect, useRef, useState } from 'react';
import { useGoogleSession } from './use-google-session';
import { backupToDrive, dailyBackupDue, lastDriveBackup, DRIVE_BACKUP_EVENT, type BackupStamp } from '@/lib/daily-backup';
import { DriveBackupError } from '@/lib/cloud-backup';
import { clearGoogleSession } from '@/lib/google-session';
import type { createBackup } from '@/lib/backup';

type Props={clientId:string;enabled:boolean;online:boolean;ready:boolean;day:string;zone:string;makeBackup:()=>ReturnType<typeof createBackup>};
export function useDailyBackup({clientId,enabled,online,ready,day,zone,makeBackup}:Props) {
  const {account,savedEmail}=useGoogleSession(clientId,'drive');
  const [stamp,setStamp]=useState<BackupStamp|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[wake,setWake]=useState(0);
  const source=useRef(makeBackup);source.current=makeBackup;
  const pending=useRef<AbortController|null>(null),attempt=useRef({key:'',time:0});
  useEffect(()=>{
    const update=()=>{const next=lastDriveBackup(clientId,account?.email||savedEmail);setStamp(next);if(!dailyBackupDue(next,day,zone))setError('');setWake(v=>v+1);};
    update();window.addEventListener(DRIVE_BACKUP_EVENT,update);window.addEventListener('storage',update);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return()=>{window.removeEventListener(DRIVE_BACKUP_EVENT,update);window.removeEventListener('storage',update);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[clientId,account?.email,savedEmail,day,zone]);
  useEffect(()=>{setSaving(false);setError('');return()=>{pending.current?.abort();pending.current=null;};},[clientId,enabled,account?.email]);
  const due=dailyBackupDue(stamp,day,zone);
  useEffect(()=>{
    if(!enabled||!online||!ready||!account||!due||pending.current||document.visibilityState!=='visible')return;
    const key=clientId+account.email+day+account.token;
    if(attempt.current.key===key&&Date.now()-attempt.current.time<15*60000)return;
    const timer=setTimeout(()=>{
      if(document.visibilityState!=='visible'||pending.current)return;
      const controller=new AbortController();pending.current=controller;attempt.current={key,time:Date.now()};setSaving(true);setError('');
      void backupToDrive(clientId,account,()=>source.current(),zone,true,controller.signal).then(()=>{if(!controller.signal.aborted)setStamp(lastDriveBackup(clientId,account.email));}).catch(e=>{
        if(controller.signal.aborted)return;
        if(e instanceof DriveBackupError&&e.reconnect)clearGoogleSession(clientId,'drive');
        setError(e instanceof Error?e.message:'Daily backup could not complete. Try Back up now.');
      }).finally(()=>{if(pending.current===controller){pending.current=null;setSaving(false);}});
    },900);
    return()=>clearTimeout(timer);
  },[clientId,enabled,online,ready,day,zone,account?.token,due,wake]);
  return {saving,error,due,needsConnection:Boolean(enabled&&due&&!account),message:!enabled?'Daily backup is off.':saving?'Saving your daily copy…':!due?'Today’s backup is saved.':!online?'Waiting for an internet connection.':!account?savedEmail?'Your account is saved. Continue with Google Drive to renew access.':'Connect Google Drive to start daily backups.':'Daily backup will run after your records are saved.'};
}
