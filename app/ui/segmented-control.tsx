"use client";

import { useId } from "react";
import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./segmented-control.module.css";

type Option<T extends string> = { value: T; label: string };

/** A row of choices with one highlight that slides to the picked option. */
export default function SegmentedControl<T extends string>({ options, value, onChange, label, className }: { options: Option<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  const id = useId();
  return <div className={`${styles.control} ${className ?? ""}`} role="radiogroup" aria-label={label}>
    {options.map(option => {
      const selected = option.value === value;
      return <button key={option.value} type="button" role="radio" aria-checked={selected} className={`${styles.option} ${selected ? styles.selected : ""}`} onClick={() => onChange(option.value)}>
        {selected && <m.span layoutId={`seg-${id}`} className={styles.highlight} transition={spring.snappy}/>}
        <span className={styles.label}>{option.label}</span>
      </button>;
    })}
  </div>;
}
