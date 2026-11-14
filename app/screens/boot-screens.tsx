"use client";

import { decodeSubmissions, loadState, saveState, validateBackup } from "@/lib/storage";
import { readStored, STORAGE_KEY } from "@/lib/stored-data";
import { download } from "../features/download";

/** Shown when saved data can't be read. Nothing is deleted; it offers the raw data and a restore. */
export function RecoveryScreen({ message, onError }: { message: string; onError: (message: string) => void }) {
  return <main className="recovery-screen"><h1>Your data needs attention.</h1><p>{message}</p><button className="secondary-btn" onClick={async () => { const saved = await loadState().catch(() => null); download("routehours-original-data.json", saved?.data ? JSON.stringify(saved.data, null, 2) : localStorage.getItem(STORAGE_KEY) || "{}", "application/json"); }}>Download original browser data</button><label>Restore a valid backup<input type="file" accept=".json" onChange={async e => { try { const f = e.target.files?.[0]; if (!f) return; const value = JSON.parse(await f.text()); validateBackup(value); const receipts = decodeSubmissions(value.submissions); if (!window.confirm("Use this backup to recover your records? Download the original first.")) return; const latest = await loadState(); await saveState(readStored(value), latest.revision, receipts); location.reload(); } catch (error) { onError((error as Error).message); } }}/></label></main>;
}

export function LoadingScreen() {
  return <main className="loading-screen"><img src="/icon-192-v3.png" alt="" width="88" height="88"/><h1>RouteHours</h1><p>Your time, simply.</p><span className="loading-orb" aria-label="Loading your hours"/></main>;
}
