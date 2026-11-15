"use client";

import styles from "./toggle.module.css";

/** An on/off switch. The knob travels on the `tap` spring (CSS, on the compositor); amber shows "on". */
export default function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`${styles.toggle} ${checked ? styles.on : ""}`} onClick={() => onChange(!checked)}>
    <span className={styles.knob}/>
  </button>;
}
