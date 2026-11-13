import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addPastShift, goToWeek, openApp, waitForSave } from "./helpers";

test("a shift across midnight shows as two pieces in Week", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-09T22:00", "2026-11-10T01:30");
  await goToWeek(page);
  await expect(page.getByRole("button", { name: /Edit 22:00 to 24:00 shift on 2026-11-09/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit 00:00 to 01:30 shift on 2026-11-10/ })).toBeVisible();
  await expect(page.locator(".week-heading")).toContainText("3h 30m");
});

test("a shift across the October clock change counts real hours", async ({ page }) => {
  await openApp(page, { now: new Date("2026-10-28T08:00:00.000Z") });
  // Clocks go back 03:00 → 02:00 on 25 October 2026, so 00:00–06:00 local is seven real hours.
  await addPastShift(page, "2026-10-25T00:00", "2026-10-25T06:00");
  await goToWeek(page);
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.locator(".week-heading")).toContainText("7h");
});

test("four shifts on one day all show", async ({ page }) => {
  await openApp(page);
  for (const [start, end] of [["06:00", "07:00"], ["08:00", "09:00"], ["12:00", "13:00"], ["15:00", "16:30"]]) await addPastShift(page, `2026-11-10T${start}`, `2026-11-10T${end}`);
  await goToWeek(page);
  await expect(page.locator(".week-day.has-shifts .week-shift")).toHaveCount(4);
  await expect(page.locator(".week-heading")).toContainText("4h 30m");
});

test("a second tab that saves stops the first tab from overwriting", async ({ page, context }) => {
  await openApp(page);
  await waitForSave(page);
  const second = await context.newPage();
  await second.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await second.goto("/");
  await addPastShift(second, "2026-11-10T07:00", "2026-11-10T08:00");
  await expect(second.locator(".timer-foot")).toHaveText("Saved on this device");
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alertdialog", { name: "Saving paused" })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toContainText("Another tab changed your records");
});

test("replacing from a backup while a shift runs asks first", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-09T07:00", "2026-11-09T08:00");
  await waitForSave(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Backups" }).click();
  const downloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Download backup" }).click();
  const file = await (await downloadPromise).path();
  expect(JSON.parse(readFileSync(file, "utf8")).active).toBeNull();
  await settings.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Start shift" }).click();
  await waitForSave(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await settings.getByRole("button", { name: "Backups" }).click();
  await settings.locator('input[type="file"]').setInputFiles(file);
  const preview = page.getByRole("dialog", { name: "Restore preview" });
  const messages: string[] = [];
  page.once("dialog", dialog => { messages.push(dialog.message()); void dialog.dismiss(); });
  await preview.getByRole("button", { name: "Replace from backup" }).click();
  await expect(preview).toBeVisible();
  expect(messages[0]).toMatch(/A shift is running/);
});
