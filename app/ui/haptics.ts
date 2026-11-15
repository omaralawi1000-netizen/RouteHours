/** A 10 ms tick on Start, Finish and a completed hold. Nothing else buzzes. */
let enabled = true;
export function setHaptics(on: boolean) { enabled = on; }
export function hapticsEnabled() { return enabled; }
export function tick() {
  if (!enabled || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try { navigator.vibrate(10); } catch { /* Some browsers block vibration without a gesture. */ }
}
