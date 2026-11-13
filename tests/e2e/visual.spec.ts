import { expect, test } from "@playwright/test";
import { addPastShift, goToWeek, openApp, waitForSave } from "./helpers";

// Pixel baselines that prove a refactor changed nothing visible.
test.use({ reducedMotion: "reduce", colorScheme: "light" });

test.beforeEach(async ({ page }) => {
  await openApp(page, { paused: true });
  await addPastShift(page, "2026-11-10T07:00", "2026-11-10T09:30", "Morning route");
  await waitForSave(page);
});

test("Today idle", async ({ page }) => {
  await expect(page).toHaveScreenshot("today-idle.png", { fullPage: true });
});

test("Today running", async ({ page }) => {
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.clock.runFor(65_000);
  await waitForSave(page);
  await expect(page).toHaveScreenshot("today-running.png", { fullPage: true });
});

test("Week", async ({ page }) => {
  await goToWeek(page);
  await expect(page).toHaveScreenshot("week.png", { fullPage: true });
});

test("Settings", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page).toHaveScreenshot("settings.png");
});

test("Edit dialog", async ({ page }) => {
  await goToWeek(page);
  await page.getByRole("button", { name: /Edit 07:00 to 09:30 shift/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit shift" })).toBeVisible();
  await expect(page).toHaveScreenshot("edit-dialog.png");
});
