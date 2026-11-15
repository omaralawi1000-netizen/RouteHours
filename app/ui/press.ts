"use client";

/**
 * Press feedback that never waits for the page. pointerdown marks the pressed element and CSS dips
 * it with the `scale` property (see [data-press] in tokens.css), so the browser animates it on the
 * compositor, and it comes back wherever the finger lifts or when a scroll takes over.
 * Elements opt in with `data-press` (and `--press` for a deeper dip).
 */
let installed = false;
export function installPress() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  let pressed: Element | null = null;
  const release = () => { pressed?.removeAttribute("data-pressed"); pressed = null; };
  document.addEventListener("pointerdown", event => {
    const target = event.target instanceof Element ? event.target.closest("[data-press]") : null;
    release();
    if (!target || target.matches(":disabled")) return;
    target.setAttribute("data-pressed", "");
    pressed = target;
  }, { capture: true, passive: true });
  for (const type of ["pointerup", "pointercancel", "dragstart", "blur"]) window.addEventListener(type, release, { capture: true, passive: true });
}
