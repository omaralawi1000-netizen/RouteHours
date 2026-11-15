import { DEFAULT_ZONE } from './ledger.ts';
import { validateBackup } from './storage.ts';
import { DEFAULT_TEMPLATES, validateTemplates, type ShiftTemplate } from './templates.ts';
import type { ActiveShift, Shift } from './time.ts';
import type { DayDetails, PayrollProfile } from './timesheet.ts';

/** The legacy localStorage key. It now only holds a small theme hint; records live in IndexedDB. */
export const STORAGE_KEY = 'routehours:v1';
export type DictationLanguage = 'auto' | 'en' | 'da' | 'ar';
export type ThemeMode = 'system' | 'light' | 'dark';
/** Everything RouteHours saves on the device, as one snapshot. */
export type StoredData = { workZone: string; shifts: Shift[]; active: ActiveShift | null; noteDraft: string; aiEnabled: boolean; accessCode: string; geminiApiKey: string; groqApiKey: string; dictationLanguage: DictationLanguage; googleClientId: string; themeMode: ThemeMode; weeklyGoalHours: number; payroll: PayrollProfile; dayDetails: DayDetails; templates: ShiftTemplate[] };

export const UNREADABLE_DATA = 'Your saved data could not be read. It has been preserved. Export the original data below before restoring a valid backup.';

/** Turns saved or restored data into a complete, safe snapshot. Missing or odd fields fall back to defaults; invalid records throw. */
export function parseStoredData(value: unknown): StoredData {
  try {
    const v = value as Record<string, any> | null | undefined;
    if (value) validateBackup(value);
    return {
      workZone: typeof v?.workZone === 'string' ? v.workZone : DEFAULT_ZONE,
      shifts: Array.isArray(v?.shifts) ? v.shifts.filter((s: Shift) => s && s.id && s.start && s.end) : [],
      active: v?.active?.start ? v.active : null,
      noteDraft: v?.active?.start && typeof v?.noteDraft === 'string' ? v.noteDraft.slice(0, 2000) : '',
      aiEnabled: v?.aiEnabled === true,
      accessCode: typeof v?.accessCode === 'string' && !v.accessCode.startsWith('AIza') ? v.accessCode : '',
      geminiApiKey: typeof v?.geminiApiKey === 'string' ? v.geminiApiKey : typeof v?.accessCode === 'string' && v.accessCode.startsWith('AIza') ? v.accessCode : '',
      groqApiKey: typeof v?.groqApiKey === 'string' ? v.groqApiKey : '',
      dictationLanguage: v?.dictationLanguage === 'en' || v?.dictationLanguage === 'da' || v?.dictationLanguage === 'ar' ? v.dictationLanguage : 'auto',
      googleClientId: typeof v?.googleClientId === 'string' ? v.googleClientId : '',
      themeMode: v?.themeMode === 'light' || v?.themeMode === 'dark' ? v.themeMode : 'system',
      weeklyGoalHours: typeof v?.weeklyGoalHours === 'number' && Number.isFinite(v.weeklyGoalHours) ? Math.max(0, Math.min(80, v.weeklyGoalHours)) : 0,
      payroll: { name: typeof v?.payroll?.name === 'string' ? v.payroll.name : '', number: typeof v?.payroll?.number === 'string' ? v.payroll.number : '', email: typeof v?.payroll?.email === 'string' ? v.payroll.email : '' },
      dayDetails: v?.dayDetails && typeof v.dayDetails === 'object' && !Array.isArray(v.dayDetails) ? v.dayDetails : {},
      templates: validateTemplates(v?.templates ?? DEFAULT_TEMPLATES),
    };
  } catch { throw new Error(UNREADABLE_DATA); }
}

/** Reads `input`, or the legacy localStorage copy when no input is given (first launch after the IndexedDB move). */
export function readStored(input?: unknown): StoredData {
  if (input !== undefined) return parseStoredData(input);
  let legacy: unknown;
  try { legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { throw new Error(UNREADABLE_DATA); }
  return parseStoredData(legacy);
}
