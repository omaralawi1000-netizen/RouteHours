import { dateInZone } from './ledger.ts';
import { uploadCloudBackup, DriveBackupError } from './cloud-backup.ts';
import type { createBackup } from './backup.ts';
import type { GoogleAccount } from './google-auth.ts';

export const DRIVE_BACKUP_KEY='routehours:last-drive-backup';
export const DRIVE_BACKUP_EVENT='routehours:drive-backup';
export type BackupStamp={email:string;createdAt:string;id:string;clientId?:string};
const queues=new Map<string,Promise<unknown>>();
function read(name:string):BackupStamp|null {
  try {const value=JSON.parse(localStorage.getItem(name)||'null');return value&&typeof value.email==='string'&&typeof value.id==='string'&&Number.isFinite(Date.parse(value.createdAt))?value:null;}catch{return null;}
}
export function lastDriveBackup(clientId?:string,email?:string):BackupStamp|null {
  if(clientId===undefined&&email===undefined)return read(DRIVE_BACKUP_KEY);
  if(!clientId||!email)return null;
  const saved=read(DRIVE_BACKUP_KEY+':'+clientId+':'+email), previous=read(DRIVE_BACKUP_KEY);
  return saved || (previous?.clientId===clientId&&previous.email===email?previous:null);
}
export function dailyBackupDue(last:BackupStamp|null,day:string,zone:string) {return !last||dateInZone(last.createdAt,zone)!==day;}
function remember(stamp:BackupStamp) {
  try {localStorage.setItem(DRIVE_BACKUP_KEY,JSON.stringify(stamp));localStorage.setItem(DRIVE_BACKUP_KEY+':'+stamp.clientId+':'+stamp.email,JSON.stringify(stamp));}catch{/* The actual Drive copy is still saved. */}
  if(typeof window!=='undefined')window.dispatchEvent(new Event(DRIVE_BACKUP_EVENT));
}
export async function backupToDrive(clientId:string,account:GoogleAccount,makeBackup:()=>ReturnType<typeof createBackup>,zone:string,daily=false,signal?:AbortSignal) {
  const name='routehours:drive-backup:'+clientId+':'+account.email;
  const run=async()=>{
    if(signal?.aborted)throw new Error('Backup cancelled.');
    if(account.expires<=Date.now())throw new DriveBackupError('Your Google access needs renewing. Your account and client ID are saved.',true);
    if(daily&&!dailyBackupDue(lastDriveBackup(clientId,account.email),dateInZone(Date.now(),zone),zone))return null;
    const backup=await makeBackup();
    if(signal?.aborted)throw new Error('Backup cancelled.');
    const file=await uploadCloudBackup(account.token,backup.blob,backup.data.createdAt,signal);
    const stamp={clientId,email:account.email,createdAt:backup.data.createdAt,id:file.id};
    remember(stamp);return {file,stamp};
  };
  // The same lock covers manual and daily copies, preventing duplicate daily uploads across tabs.
  if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request(name,{signal},run);
  const pending=(queues.get(name)||Promise.resolve()).catch(()=>{}).then(run);queues.set(name,pending);
  try{return await pending;}finally{if(queues.get(name)===pending)queues.delete(name);}
}
