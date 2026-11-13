import type { Transition } from "motion/react";

/**
 * The only timings RouteHours uses. A new one-off timing is a bug.
 *
 * Each spring is written as Apple describes them, a duration plus a bounce, and turned into
 * stiffness and damping with Apple's recipe (mass 1):
 *   stiffness = (2π / duration)²     damping = (1 − bounce) · 4π / duration
 * so a 0.38 s spring here feels like a 0.38 s spring on iOS.
 */
export function appleSpring(duration: number, bounce = 0): Transition {
  return { type: "spring", stiffness: (2 * Math.PI / duration) ** 2, damping: (1 - bounce) * 4 * Math.PI / duration, mass: 1 };
}

export const spring = {
  /** Press dip and toggles. */
  tap: appleSpring(0.18),
  /** Segmented controls, chips, rolling digits. */
  snappy: appleSpring(0.25),
  /** The default: sheets, cards growing into pages, screen changes. */
  smooth: appleSpring(0.38),
  /** One soft settle when something lands. */
  settle: appleSpring(0.45, 0.12),
  /** Rare: the week's timesheet sent. */
  reward: appleSpring(0.6, 0.25),
  /** Anything leaving. Exits are faster than entrances. */
  exit: appleSpring(0.2),
} satisfies Record<string, Transition>;
export type SpringName = keyof typeof spring;

/** Everything else that changes in the same moment as the main movement: a short fade, under 0.2 s. */
export const fade: Transition = { duration: 0.16, ease: [0.2, 0, 0, 1] };

/** Duration and bounce of each token, for the lab's spring table. */
export const springSpec: Record<SpringName, { duration: number; bounce: number; job: string }> = {
  tap: { duration: 0.18, bounce: 0, job: "Press dip to 97%, toggles" },
  snappy: { duration: 0.25, bounce: 0, job: "Segmented controls, chips, rolling digits" },
  smooth: { duration: 0.38, bounce: 0, job: "Sheets, cards into pages, screen changes" },
  settle: { duration: 0.45, bounce: 0.12, job: "One soft settle when something lands" },
  reward: { duration: 0.6, bounce: 0.25, job: "Rare: the week's timesheet sent" },
  exit: { duration: 0.2, bounce: 0, job: "Anything leaving" },
};
