"use client";

import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./toggle.module.css";

/** An on/off switch. The knob travels on the `tap` spring; amber shows "on". */
export default function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`${styles.toggle} ${checked ? styles.on : ""}`} onClick={() => onChange(!checked)}>
    <m.span className={styles.knob} initial={false} animate={{ x: checked ? 20 : 0 }} transition={spring.tap}/>
  </button>;
}
