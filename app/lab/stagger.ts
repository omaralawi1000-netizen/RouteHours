import type { Variants } from "motion/react";
import { spring } from "../ui/motion";

/*
 * Screens move only with transform, never opacity. A parent with opacity below 1 cuts the glass
 * off from the wallpaper behind it, so the blur would vanish and then pop back when the fade ends.
 * Transform keeps the blur on every frame.
 */

/**
 * The page itself. On first open it holds still while its cards settle one after another. On a tab
 * change it slides in from the side of the tab you came from, while the old page slides out the
 * other way, so the two move as one strip with no gap and no blank frame.
 */
export const screen: Variants = {
  hidden: { x: 0 },
  enter: (direction: number) => ({ x: `${direction * 100}%` }),
  show: { x: 0, transition: { ...spring.smooth, staggerChildren: 0.04, delayChildren: 0.02 } },
  leave: (direction: number) => ({ x: `${direction * -100}%`, transition: spring.smooth }),
};

/** Each card: a short rise and settle, fully visible (and blurred) from the first frame. */
export const item: Variants = {
  hidden: { y: 14, scale: 0.985 },
  show: { y: 0, scale: 1, transition: spring.settle },
};
