"use client";

import type { CSSProperties } from "react";
import styles from "./segmented-control.module.css";

type Option<T extends string> = { value: T; label: string };

/** A row of equal choices with one highlight that slides to the picked one (CSS, on the compositor). */
export default function SegmentedControl<T extends string>({ options, value, onChange, label, className }: { options: Option<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  const index = options.findIndex(option => option.value === value);
  return <div className={`${styles.control} ${className ?? ""}`} role="radiogroup" aria-label={label} style={{ "--count": options.length, "--at": Math.max(0, index) } as CSSProperties}>
    {index >= 0 && <span className={styles.highlight} aria-hidden="true"/>}
    {options.map(option => {
      const selected = option.value === value;
      return <button key={option.value} type="button" role="radio" aria-checked={selected} className={`${styles.option} ${selected ? styles.selected : ""}`} onClick={() => onChange(option.value)}>
        <span className={styles.label}>{option.label}</span>
      </button>;
    })}
  </div>;
}
