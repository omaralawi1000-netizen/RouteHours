"use client";

import type { CSSProperties, ReactNode } from "react";
import styles from "./tab-bar.module.css";

export type Tab<T extends string> = { id: T; label: string; icon: ReactNode };

/**
 * The floating glass dock. The tabs are all the same width, so the lit pill glides across with
 * one transform (and one soft settle) and the new tab's icon gives a small hop. Both are CSS the
 * browser runs on its compositor, so they stay smooth while the new screen is being drawn.
 */
export default function TabBar<T extends string>({ tabs, value, onChange }: { tabs: Tab<T>[]; value: T; onChange: (id: T) => void }) {
  const index = Math.max(0, tabs.findIndex(tab => tab.id === value));
  return <nav className={styles.dock} aria-label="Sections" style={{ "--tabs": tabs.length, "--at": index } as CSSProperties}>
    <span className={styles.pill} aria-hidden="true"/>
    {tabs.map(tab => {
      const active = tab.id === value;
      return <button key={tab.id} type="button" data-press className={`${styles.tab} ${active ? styles.active : ""}`} aria-label={tab.label} aria-current={active ? "page" : undefined} onClick={() => { if (!active) onChange(tab.id); }}>
        <span key={active ? "on" : "off"} className={styles.icon} aria-hidden="true">{tab.icon}</span>
        <span className={styles.label}>{tab.label}</span>
      </button>;
    })}
  </nav>;
}
