"use client";

/** Saving has stopped (an error, or another tab wrote newer data). Offer a backup and a reload. */
export default function StorageError({ message, onBackup }: { message: string; onBackup: () => void }) {
  return <div className="modal-backdrop"><div className="modal" role="alertdialog" aria-modal="true" aria-label="Saving paused"><h2>Let&apos;s keep your hours safe.</h2><p>{message}</p><button className="modal-submit" onClick={onBackup}>Download this screen&apos;s records</button><button className="secondary-btn" onClick={() => location.reload()}>Reload latest saved version</button></div></div>;
}
