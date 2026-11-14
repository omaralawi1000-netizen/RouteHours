"use client";

import { useRef, useState } from "react";
import { authorizeGoogleAccount, GOOGLE_EMAIL_SCOPE, GOOGLE_FILE_SCOPE, normalizeGoogleClientId, validGoogleClientId } from "@/lib/google-auth";
import { createGoogleSheet, shareGoogleSheet } from "@/lib/sheets";
import type { Shift } from "@/lib/time";
import type { WeeklyReport } from "@/lib/timesheet";

export function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }

type Options = {
  shifts: Shift[];
  googleClientId: string;
  onNotice: (message: string) => void;
  /** Google isn't set up: close what's open and send the person to Settings with this message. */
  onNeedSettings: (message: string) => void;
  /** Called as an export starts, so menus can close. */
  onBegin?: () => void;
};

/** Creates a Google Sheet of the hours, and optionally shares it by email through Google Drive. */
export function useSheetExport({ shifts, googleClientId, onNotice, onNeedSettings, onBegin }: Options) {
  const latest = useRef({ shifts, googleClientId, onNotice, onNeedSettings, onBegin });
  latest.current = { shifts, googleClientId, onNotice, onNeedSettings, onBegin };
  const [sheetUrl, setSheetUrl] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [role, setRole] = useState<"reader" | "writer">("reader");
  const [error, setError] = useState("");
  const [retryId, setRetryId] = useState("");
  const [creating, setCreating] = useState(false);
  const [report, setReport] = useState<WeeklyReport | undefined>();

  async function exportSheet(share = false, forReport = report) {
    const { shifts: current, googleClientId: savedId, onNotice, onNeedSettings, onBegin } = latest.current;
    const clientId = normalizeGoogleClientId(savedId) || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (share && !validEmail(recipient)) { setError("Enter a valid email address before sharing."); return; }
    if (!clientId) { onBegin?.(); setShareOpen(false); onNeedSettings("Add and save your Google OAuth client ID in Settings first."); return; }
    if (!validGoogleClientId(clientId)) { onBegin?.(); setShareOpen(false); onNeedSettings("Check the Google Web application client ID in Settings."); return; }
    onBegin?.(); setError(""); setShareStatus(""); setCreating(true);
    if (!retryId) setSheetUrl("");
    try {
      const { token } = await authorizeGoogleAccount(clientId, "drive", [GOOGLE_FILE_SCOPE, GOOGLE_EMAIL_SCOPE]);
      const result = share && retryId ? { id: retryId, url: sheetUrl, complete: true } : await createGoogleSheet(token, current, forReport);
      setSheetUrl(result.url);
      if (!result.complete) { setError("The Sheet was created, but its hours could not be added. Open it below and try the CSV export."); onNotice("Sheet created without hours. Open the link below."); return; }
      if (share) {
        setRetryId(result.id);
        await shareGoogleSheet(token, result.id, recipient, role);
        setShareStatus(`Google sent a sharing notification to ${recipient.trim()}.`);
        setRetryId(""); setShareOpen(false);
        onNotice("Google Sheet created and shared by email.");
      } else { setRetryId(""); onNotice("Google Sheet created. Open it from the link below."); }
    } catch (e) { const message = e instanceof Error ? e.message : "Could not create or share Google Sheet."; setError(message); onNotice(message); }
    finally { setCreating(false); }
  }

  /** Called from the weekly timesheet: save to Sheets now, or open the share dialog prefilled with `defaultRecipient`. */
  function startFromReport(next: WeeklyReport, email: boolean, defaultRecipient: string) {
    setReport(next); setRetryId(""); setError("");
    if (email) { setRecipient(defaultRecipient); setShareOpen(true); } else void exportSheet(false, next);
  }

  return { sheetUrl, shareStatus, shareOpen, setShareOpen, recipient, setRecipient, role, setRole, error, setError, retryId, creating, report, exportSheet, startFromReport };
}
export type SheetExport = ReturnType<typeof useSheetExport>;
