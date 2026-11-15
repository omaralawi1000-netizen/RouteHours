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

const springs = {
  tap: appleSpring(0.18),
  snappy: appleSpring(0.25),
  smooth: appleSpring(0.38),
  settle: appleSpring(0.45, 0.12),
  reward: appleSpring(0.6, 0.25),
  exit: appleSpring(0.2),
};

let reduced = false;
/**
 * Reduce motion (the app's setting or the phone's). Movement then happens at once and only fades
 * remain. Motion only does this by itself for x, y and scale, not for a `transform` string, so
 * every spring carries it: Home sets this before its screens render.
 */
export function setReducedMotion(value: boolean) { reduced = value; }
export const isReducedMotion = () => reduced;
const still = (transition: Transition): Transition => reduced ? { ...transition, transform: { duration: 0 } } : transition;

export const spring = {
  /** Press dip and toggles. */
  get tap() { return still(springs.tap); },
  /** Segmented controls, chips, rolling digits. */
  get snappy() { return still(springs.snappy); },
  /** The default: sheets, cards growing into pages, screen changes. */
  get smooth() { return still(springs.smooth); },
  /** One soft settle when something lands. */
  get settle() { return still(springs.settle); },
  /** Rare: the week's timesheet sent. */
  get reward() { return still(springs.reward); },
  /** Anything leaving. Exits are faster than entrances. */
  get exit() { return still(springs.exit); },
} satisfies Record<string, Transition>;
export type SpringName = keyof typeof spring;

/**
 * A move as one CSS transform string. Motion hands a `transform` string to the browser, which runs
 * it on the compositor thread at the screen's full rate (120 Hz on Omar's phone) even while the
 * page is busy saving or drawing. x, y and scale given one by one are written from JavaScript on
 * every frame instead, and stutter whenever the page is busy. Always the same functions in the same
 * order, so any two of these blend cleanly.
 */
export function tf({ x = 0, y = 0, scale = 1, rotate = 0 }: { x?: number | string; y?: number | string; scale?: number; rotate?: number } = {}) {
  const length = (value: number | string) => typeof value === "number" ? `${value}px` : value;
  return `translate(${length(x)}, ${length(y)}) scale(${scale}) rotate(${rotate}deg)`;
}

const curves = new Map<string, KeyframeAnimationOptions>();
/**
 * A spring as the CSS curve in tokens.css, for the browser's own el.animate(). Unlike Motion's
 * animate(), which starts on the next frame, this applies in the frame it is called, so a card
 * that was just moved by layout never shows one frame at its new place before it slides.
 */
export function cssSpring(name: Exclude<SpringName, "reward">): KeyframeAnimationOptions {
  let curve = curves.get(name);
  if (!curve) {
    const css = getComputedStyle(document.documentElement);
    // The build's CSS minifier may write 550ms as .55s, so read the unit too.
    const time = css.getPropertyValue(`--spring-${name}-ms`).trim();
    const ms = time.endsWith("ms") ? parseFloat(time) : parseFloat(time) * 1000;
    curve = { duration: ms > 0 ? ms : springSpec[name].duration * 1000, easing: css.getPropertyValue(`--spring-${name}`).trim() || "cubic-bezier(0.2, 0, 0, 1)" };
    curves.set(name, curve);
  }
  return curve;
}

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
