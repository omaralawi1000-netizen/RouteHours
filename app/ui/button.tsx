"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { m } from "motion/react";
import { spring } from "./motion";
import styles from "./button.module.css";

type Variant = "primary" | "glass" | "quiet" | "danger";
type Props = Omit<ComponentPropsWithoutRef<typeof m.button>, "children"> & { variant?: Variant; size?: "main" | "regular" | "small"; icon?: ReactNode; children?: ReactNode };

/**
 * Buttons respond on the very next frame: a press dips to 97% on the `tap` spring and comes
 * back on release, wherever the finger lifts. Amber (primary) is only for the one thing to tap.
 */
const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = "glass", size = "regular", icon, children, className, ...rest }, ref) {
  return <m.button ref={ref} type="button" whileTap={rest.disabled ? undefined : { scale: 0.97 }} transition={spring.tap} className={`${styles.button} ${styles[variant]} ${styles[size]} ${className ?? ""}`} {...rest}>
    {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
    {children}
  </m.button>;
});
export default Button;
