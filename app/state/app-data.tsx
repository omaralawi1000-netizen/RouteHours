"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadState, saveState, stateSignature, type Submission } from "@/lib/storage";
import { readStored, STORAGE_KEY, type StoredData } from "@/lib/stored-data";

export type SaveStatus = "Loading your records…" | "Saving…" | "Saved on this device" | "Not saved";
/** A partial change, or a function of the latest data that returns one. */
export type DataChange = Partial<StoredData> | ((current: StoredData) => Partial<StoredData>);

type AppData = {
  data: StoredData;
  loaded: boolean;
  bootError: string;
  setBootError: (message: string) => void;
  saveStatus: SaveStatus;
  storageError: string;
  /** True once saving has stopped because of an error or another tab. */
  isBlocked: () => boolean;
  /** Change saved data. Saving happens automatically right after. */
  update: (change: DataChange) => void;
  /**
   * Apply `change` to the latest data, save it now (with optional email receipts) and wait for it.
   * On success only `change` is applied, so edits made while saving are kept.
   */
  saveNow: (change: Partial<StoredData>, receipts?: Submission[]) => Promise<void>;
};

const AppDataContext = createContext<AppData | null>(null);

/**
 * One store for everything RouteHours saves. It owns the single save queue and the
 * two-tab guard, so every screen reads and changes data the same way.
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoredData>(() => readStoredDefaults());
  const [loaded, setLoaded] = useState(false);
  const [bootError, setBootError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("Loading your records…");
  const [storageError, setStorageError] = useState("");
  const lastEnqueued = useRef("");
  const latest = useRef(data);
  useEffect(() => { latest.current = data; }, [data]);
  const revision = useRef(0), saveQueue = useRef<Promise<void>>(Promise.resolve()), storageBlocked = useRef(false), saveSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadState<StoredData>().then(({ data: saved, revision: rev }) => {
      if (cancelled) return;
      if (!saved && JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")?.storageVersion === 2) throw new Error("The device database is missing. Restore an external backup; your settings have been preserved.");
      const next = readStored(saved || undefined); revision.current = rev;
      if (saved) { lastEnqueued.current = stateSignature(next); setSaveStatus("Saved on this device"); }
      setData(next); setLoaded(true);
    }).catch(e => { if (!cancelled) setBootError(e.message); });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((next: StoredData, receipts: Submission[] = []) => {
    lastEnqueued.current = stateSignature(next);
    const sequence = ++saveSequence.current;
    setSaveStatus("Saving…");
    const operation = saveQueue.current.then(async () => {
      if (storageBlocked.current) throw new Error("Saving is paused. Back up this screen and reload.");
      revision.current = await saveState(next, revision.current, receipts);
      if (receipts.length) window.dispatchEvent(new Event("routehours:submissions"));
      // Keep a small theme/settings hint. The database is authoritative; legacy data is untouched until migration succeeds.
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ storageVersion: 2, themeMode: next.themeMode })); } catch { /* Records are already saved transactionally. */ }
      if (sequence === saveSequence.current) setSaveStatus("Saved on this device");
    });
    saveQueue.current = operation.catch(error => { storageBlocked.current = true; setSaveStatus("Not saved"); setStorageError(error.message); });
    return operation;
  }, []);

  // Save after every change that differs from what was last queued.
  useEffect(() => {
    if (!loaded || lastEnqueued.current === stateSignature(data)) return;
    void persist(data).catch(() => {});
  }, [loaded, data, persist]);

  // Two-tab guard: stop saving if another tab wrote a newer revision.
  useEffect(() => {
    if (!loaded) return;
    const check = () => { void loadState<StoredData>().then(latest => { if (latest.revision > revision.current && document.visibilityState === "visible") { storageBlocked.current = true; setStorageError("Another tab changed your records. Back up any unsaved changes, then reload to continue with the latest version."); } }).catch(() => {}); };
    const timer = window.setInterval(check, 5000); window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [loaded]);

  const update = useCallback((change: DataChange) => {
    setData(current => {
      const patch = typeof change === "function" ? change(current) : change;
      return Object.keys(patch).length ? { ...current, ...patch } : current;
    });
  }, []);
  const saveNow = useCallback(async (change: Partial<StoredData>, receipts: Submission[] = []) => {
    await persist({ ...latest.current, ...change }, receipts);
    setData(current => ({ ...current, ...change }));
  }, [persist]);
  const isBlocked = useCallback(() => storageBlocked.current, []);

  const value = useMemo<AppData>(() => ({ data, loaded, bootError, setBootError, saveStatus, storageError, isBlocked, update, saveNow }), [data, loaded, bootError, saveStatus, storageError, isBlocked, update, saveNow]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function readStoredDefaults(): StoredData { return readStored(null); }

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
