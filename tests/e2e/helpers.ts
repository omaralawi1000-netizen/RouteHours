import { expect, type Page } from "@playwright/test";

// Wednesday 11 November 2026, 08:00 in Copenhagen.
export const FIXED_NOW = new Date("2026-11-11T07:00:00.000Z");

export async function openApp(page: Page, options: { now?: Date; paused?: boolean } = {}) {
  // Keep tests offline from Google: block the sign-in script and any other outside request.
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.clock.install({ time: options.now ?? FIXED_NOW });
  if (options.paused) await page.clock.pauseAt(options.now ?? FIXED_NOW);
  await page.goto("/");
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
