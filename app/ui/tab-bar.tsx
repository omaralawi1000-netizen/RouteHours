"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./tab-bar.module.css";

export type Tab<T extends string> = { id: T; label: string; icon: ReactNode };

/** The floating glass dock. One lit pill slides to the tab you pick. */
export default function TabBar<T extends string>({ tabs, value, onChange }: { tabs: Tab<T>[]; value: T; onChange: (id: T) => void }) {
  return <nav className={styles.dock} aria-label="Sections">
    {tabs.map(tab => {
      const active = tab.id === value;
      return <m.button key={tab.id} type="button" className={`${styles.tab} ${active ? styles.active : ""}`} aria-label={tab.label} aria-current={active ? "page" : undefined} onClick={() => onChange(tab.id)} whileTap={{ scale: 0.94 }} transition={spring.tap}>
        {active && <m.span layoutId="dock-pill" className={styles.pill} transition={spring.snappy}/>}
        <span className={styles.icon} aria-hidden="true">{tab.icon}</span>
        <span className={styles.label}>{tab.label}</span>
      </m.button>;
    })}
  </nav>;
}
