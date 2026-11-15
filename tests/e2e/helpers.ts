import { expect, type Page } from "@playwright/test";

// The classic screens (kept at /classic) are what these helpers drive.
// Wednesday 11 November 2026, 08:00 in Copenhagen.
export const FIXED_NOW = new Date("2026-11-11T07:00:00.000Z");
// The same Wednesday at 11:00, between the usual shifts, so no "Started at…?" or "Time to leave"
// notice turns up by itself. Checks that measure movement pin the clock here, or they would depend
// on the hour the tests happen to run.
export const QUIET_NOW = new Date("2026-11-11T10:00:00.000Z");

/**
 * Installs Playwright's fake clock. It also fakes performance.now(), and fastForward moves that
 * hours ahead of the page's animation timeline, which Playwright leaves on real time. Motion
 * starts each compositor (WAAPI) animation at performance.now(), so after a fastForward every
 * animation would wait hours to begin and nothing on screen would finish leaving. On a phone the
 * two are one clock; this starts each animation at the timeline's own "now", as it would be there.
 */
export async function installClock(page: Page, time: Date) {
  await page.addInitScript(() => {
    const startTime = Object.getOwnPropertyDescriptor(Animation.prototype, "startTime")!;
    Object.defineProperty(Animation.prototype, "startTime", {
      ...startTime,
      set(this: Animation, value: CSSNumberish | null) { startTime.set!.call(this, value === null ? null : document.timeline.currentTime); },
    });
  });
  await page.clock.install({ time });
}

export async function openApp(page: Page, options: { now?: Date; paused?: boolean } = {}) {
  // Keep tests offline from Google: block the sign-in script and any other outside request.
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await installClock(page, options.now ?? FIXED_NOW);
  if (options.paused) await page.clock.pauseAt(options.now ?? FIXED_NOW);
  await page.goto("/classic");
  await expect(page.getByRole("button", { name: /Start shift|Finish shift/ })).toBeVisible();
  await expect(page.getByText("Saved on this device").or(page.getByText("Loading your records…"))).toBeVisible();
}

export async function waitForSave(page: Page) {
  await expect(page.locator(".timer-foot")).toHaveText("Saved on this device");
}

export async function goToWeek(page: Page) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Week" }).click();
  await expect(page.getByRole("heading", { name: "Your week" })).toBeVisible();
}

export async function goToToday(page: Page) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Today" }).click();
}

/** Adds a finished shift through the Add a past shift dialog. Times are Copenhagen local. */
export async function addPastShift(page: Page, start: string, end: string, notes = "") {
  await page.getByRole("button", { name: "Add a past shift" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit shift" });
  await dialog.getByLabel("Start date & time").fill(start);
  await dialog.getByLabel("End date & time").fill(end);
  if (notes) await dialog.getByLabel(/Notes/).fill(notes);
  await dialog.getByRole("button", { name: /Save shift/ }).click();
  await expect(dialog).toBeHidden();
}
