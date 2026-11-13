"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./tab-bar.module.css";

export type Tab<T extends string> = { id: T; label: string; icon: ReactNode };

/**
 * The floating glass dock. Every tab keeps its label, so nothing changes width when you switch:
 * only the lit pill glides across (with one soft settle) and the new tab's icon gives a small hop.
 */
export default function TabBar<T extends string>({ tabs, value, onChange }: { tabs: Tab<T>[]; value: T; onChange: (id: T) => void }) {
  return <nav className={styles.dock} aria-label="Sections">
    {tabs.map(tab => {
      const active = tab.id === value;
      return <m.button key={tab.id} type="button" className={`${styles.tab} ${active ? styles.active : ""}`} aria-label={tab.label} aria-current={active ? "page" : undefined} onClick={() => { if (!active) onChange(tab.id); }} whileTap={{ scale: 0.94 }} transition={spring.tap}>
        {active && <m.span layoutId="dock-pill" className={styles.pill} transition={spring.settle}/>}
        <m.span className={styles.icon} aria-hidden="true" initial={false} animate={active ? { y: [0, -3, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }} transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}>{tab.icon}</m.span>
        <span className={styles.label}>{tab.label}</span>
      </m.button>;
    })}
  </nav>;
}
