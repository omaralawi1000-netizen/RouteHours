import type { ComponentPropsWithoutRef } from "react";
import styles from "./glass.module.css";

/**
 * Clear glass: live blur plus a whisper of tint and a 1 px top highlight, no grain (Omar's method A).
 * Budget: at most three blurred layers on screen (dock, main card, one open sheet). Everything else
 * uses `blur={false}`, the same look without the live blur. Battery saver / reduced transparency
 * also turns the blur off.
 */
export default function Glass({ blur = false, strong = false, className, ...rest }: ComponentPropsWithoutRef<"div"> & { blur?: boolean; strong?: boolean }) {
  return <div className={`${styles.glass} ${blur ? styles.blur : ""} ${strong ? styles.strong : ""} ${className ?? ""}`} {...rest}/>;
}
