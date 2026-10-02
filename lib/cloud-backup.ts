import { MAX_BACKUP_BYTES, parseBackupText } from './backup.ts';

export type CloudBackupFile = { id: string; name: string; createdTime: string; size: number };
export class DriveBackupError extends Error {
  reconnect: boolean;
  constructor(message: string, reconnect = false) { super(message); this.name = 'DriveBackupError'; this.reconnect = reconnect; }
}
const API = 'https://www.googleapis.com/drive/v3/files';
const FIELDS = 'id,name,createdTime,size';
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]+$/.test(id);
function fileInfo(value: unknown): CloudBackupFile {
  const file = value as Record<string, unknown> | null;
  if (!file || !validId(file.id) || typeof file.name !== 'string' || typeof file.createdTime !== 'string' || !Number.isFinite(Date.parse(file.createdTime)) || !/^\d+$/.test(String(file.size))) throw new Error('Google returned incomplete backup details. Refresh the backup list.');
  return { id: file.id, name: file.name, createdTime: file.createdTime, size: Number(file.size) };
}
async function request(url: string, token: string, init: RequestInit = {}, signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch(url, { ...init, headers: { ...init.headers, authorization: 'Bearer ' + token }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) }); }
  catch (error) { if (signal?.aborted) throw error; throw new DriveBackupError('Could not reach Google Drive. Check your connection and refresh the backup list before trying again.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => null), message = String(body?.error?.message || '');
    if (response.status === 401) throw new DriveBackupError('Your Drive session expired. Reconnect Google Drive to continue.', true);
    if (/SERVICE_DISABLED|disabled|has not been used/i.test(message)) throw new DriveBackupError('Enable Google Drive API in the project that owns your saved Web client ID, then reconnect.');
    if (response.status === 403) throw new DriveBackupError('Google Drive did not allow this action. Reconnect and approve file access, then check the Google project setup.');
    if (response.status === 404) throw new DriveBackupError('This backup is no longer available to this account. Refresh the list or download it from Google Drive.');
    throw new DriveBackupError('Google Drive could not complete the request (' + response.status + '). Refresh the backup list before trying again.');
  }
  return response;
}

export async function listCloudBackups(token: string, pageToken = '', signal?: AbortSignal) {
  const query = new URLSearchParams({ q: "trashed = false and mimeType = 'application/json' and appProperties has { key='routehoursBackup' and value='1' }", spaces: 'drive', pageSize: '20', orderBy: 'createdTime desc', fields: 'nextPageToken,files(' + FIELDS + ')' });
  if (pageToken) query.set('pageToken', pageToken);
  const response = await request(API + '?' + query, token, {}, signal);
  const result = await response.json();
  if (!Array.isArray(result?.files)) throw new DriveBackupError('Google did not return a backup list. Try refreshing it.');
  return { files: result.files.map(fileInfo) as CloudBackupFile[], nextPageToken: typeof result.nextPageToken === 'string' ? result.nextPageToken : '' };
}

export async function uploadCloudBackup(token: string, backup: Blob, createdAt: string, signal?: AbortSignal) {
  if (backup.size > MAX_BACKUP_BYTES) throw new DriveBackupError('Choose a backup smaller than 30 MB.');
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, '-');
  const name = 'RouteHours-backup-' + stamp + '.json';
  // Always create a new snapshot. A stale device can never overwrite another device's backup.
  const opened = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=' + FIELDS, token, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/json', 'x-upload-content-length': String(backup.size) },
    body: JSON.stringify({ name, mimeType: 'application/json', appProperties: { routehoursBackup: '1' } }),
  }, signal);
  const location = opened.headers.get('location');
  let session: URL;
  try { session = new URL(location || ''); } catch { throw new DriveBackupError('Google did not start the backup upload. Refresh the list before retrying.'); }
  if (session.origin !== 'https://www.googleapis.com' || session.pathname !== '/upload/drive/v3/files' || session.searchParams.get('uploadType') !== 'resumable') throw new DriveBackupError('Google returned an unexpected upload address. No backup data was uploaded.');
  const uploaded = await request(session.href, token, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: backup }, signal);
  return fileInfo(await uploaded.json());
}

export async function readCloudBackup(token: string, file: CloudBackupFile, signal?: AbortSignal) {
  if (!validId(file.id) || file.size > MAX_BACKUP_BYTES) throw new DriveBackupError('This backup is invalid or larger than 30 MB. Use a smaller backup.');
  const response = await request(API + '/' + encodeURIComponent(file.id) + '?alt=media', token, {}, signal);
  const size = Number(response.headers.get('content-length'));
  if (size > MAX_BACKUP_BYTES) { await response.body?.cancel(); throw new DriveBackupError('This backup is larger than 30 MB. Your current records have not changed.'); }
  const reader = response.body?.getReader();
  if (!reader) return parseBackupText(await response.text());
  const parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BACKUP_BYTES) { await reader.cancel(); throw new DriveBackupError('This backup is larger than 30 MB. Your current records have not changed.'); }
      parts.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return parseBackupText(await new Blob(parts as BlobPart[]).text());
}
