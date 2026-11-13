import type { Variants } from "motion/react";
import { spring } from "../ui/motion";

/** Screens rise in one piece after another, 50 ms apart, landing with a soft settle. */
export const screen: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
  leave: { opacity: 0, y: -8, transition: spring.exit },
};
export const item: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.settle },
};
