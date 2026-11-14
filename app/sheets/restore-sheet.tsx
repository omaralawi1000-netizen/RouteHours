"use client";

import { X } from "lucide-react";
import type { Backups, RestorePreview } from "../features/use-backups";

/** Shows what a backup file holds, then merges or replaces. */
export default function RestoreSheet({ preview, currentCount, backups }: { preview: RestorePreview; currentCount: number; backups: Backups }) {
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Restore preview"><div className="modal-head"><h2>Restore your hours</h2><button className="icon-btn" aria-label="Cancel restore" onClick={() => backups.setRestorePreview(null)}><X size={20}/></button></div><p>{preview.shifts.length} shifts in this file. You currently have {currentCount}.</p><p className="report-hint">{preview.createdAt ? "Saved " + new Date(preview.createdAt).toLocaleString("en-GB") + ". " : ""}{preview.templates ? preview.templates.length + " templates. " : ""}{preview.submissions?.length || 0} saved email records.</p><p><b>Merge</b> adds missing shifts and keeps current entries when IDs or times match. <b>Replace</b> uses the backup's shifts, timer, profile and templates. Email records are merged in both cases.</p><button className="modal-submit" onClick={() => void backups.applyRestore(true)}>Merge with my records</button><button className="secondary-btn" onClick={() => void backups.applyRestore(false)}>Replace from backup</button><button className="text-action" onClick={() => void backups.exportBackup()}>Back up current records first</button></div></div>;
}
