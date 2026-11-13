"use client";

import { useRef, useState } from "react";
import { createBackup } from "@/lib/backup";
import { allSubmissions, decodeSubmissions, downloadBlob, validateBackup } from "@/lib/storage";
import { validateTemplates } from "@/lib/templates";
import { useAppData } from "../state/app-data";
import { useDailyBackup } from "../use-daily-backup";
import { download } from "./download";

export function parseBackup(value: unknown) { validateBackup(value); decodeSubmissions(value.submissions); return value; }
export type RestorePreview = ReturnType<typeof parseBackup>;

type Options = {
  clientId: string;
  online: boolean;
  today: string;
  onNotice: (message: string) => void;
  /** Called after a restore is saved, so screens can clear anything that pointed at old records. */
  onRestored?: () => void;
};

/** Backup files, restore with preview, and the optional daily Google Drive backup. */
export function useBackups({ clientId, online, today, onNotice, onRestored }: Options) {
  const { data, loaded, saveStatus, saveNow } = useAppData();
  const latest = useRef(data);
  latest.current = data;
  const [lastBackup, setLastBackup] = useState(() => readLocal("routehours:last-backup") || "");
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [dailyEnabled, setDailyEnabled] = useState(() => readLocal("routehours:daily-backup") !== "false");

  async function makeCompleteBackup() {
    const source = structuredClone(latest.current), stamp = new Date().toISOString();
    return createBackup(source, await allSubmissions(), stamp);
  }
  const dailyBackup = useDailyBackup({ clientId, enabled: dailyEnabled, online, ready: loaded && saveStatus === "Saved on this device", day: today, zone: data.workZone, makeBackup: makeCompleteBackup });

  function toggleDailyBackup() {
    const enabled = !dailyEnabled; setDailyEnabled(enabled);
    try { localStorage.setItem("routehours:daily-backup", String(enabled)); } catch { onNotice("Daily backup preference could not be remembered on this device."); }
  }
  async function exportBackup() {
    try {
      const backup = await makeCompleteBackup();
      downloadBlob(backup.blob, "routehours-backup.json");
      setLastBackup(backup.data.createdAt);
      try { localStorage.setItem("routehours:last-backup", backup.data.createdAt); } catch { /* The download is complete. */ }
      onNotice("Backup downloaded. Keep this file somewhere outside this browser.");
    } catch {
      const { shifts, active, noteDraft, payroll, dayDetails, workZone, templates } = latest.current;
      download("routehours-emergency-backup.json", JSON.stringify({ shifts, active, noteDraft, payroll, dayDetails, workZone, templates }, null, 2), "application/json");
      onNotice("Downloaded current shifts and templates. Saved email files could not be included.");
    }
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try { if (file.size > 30 * 1024 * 1024) throw new Error("Choose a backup smaller than 30 MB."); setRestorePreview(parseBackup(JSON.parse(await file.text()))); }
    catch (e) { onNotice((e as Error).message); }
  }
  async function applyRestore(merge: boolean) {
    if (!restorePreview) return;
    const backup = restorePreview, current = latest.current;
    if (current.active && !merge && !window.confirm("A shift is running. Replacing will also replace this timer with the backup timer. Continue?")) return;
    try {
      const receipts = decodeSubmissions(backup.submissions);
      const combined = merge ? [...current.shifts, ...backup.shifts.filter(s => !current.shifts.some(v => v.id === s.id || v.start === s.start && v.end === s.end))] : backup.shifts;
      const restored = { ...current, shifts: combined, active: merge ? current.active : backup.active || null, noteDraft: merge ? current.noteDraft : backup.noteDraft || "", payroll: merge ? current.payroll : backup.payroll || current.payroll, dayDetails: merge ? { ...backup.dayDetails, ...current.dayDetails } : backup.dayDetails || {}, workZone: merge ? current.workZone : backup.workZone || current.workZone, templates: merge ? current.templates : validateTemplates(backup.templates ?? current.templates) };
      await saveNow(restored, receipts);
      onRestored?.(); setRestorePreview(null);
      onNotice(merge ? "Backup merged. Existing shifts, templates and timer were kept." : "Backup restored. Email history was preserved and merged.");
    } catch (e) { onNotice((e as Error).message); }
  }

  return { lastBackup, restorePreview, setRestorePreview, previewBackup: (value: unknown) => setRestorePreview(parseBackup(value)), dailyEnabled, toggleDailyBackup, dailyBackup, makeCompleteBackup, exportBackup, importBackup, applyRestore };
}
export type Backups = ReturnType<typeof useBackups>;

function readLocal(key: string) { try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; } }
