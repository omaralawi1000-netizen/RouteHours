import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { FIXED_NOW, addPastShift, goToToday, goToWeek, openApp, waitForSave } from "./helpers";

test("start a shift, add a typed note, finish it and see it in Week", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await expect(page.getByRole("heading", { name: "Shift in progress" })).toBeVisible();
  await page.getByLabel("Shift note").fill("Route 3A ran ten minutes late");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("1 saved note")).toBeVisible();
  await page.clock.fastForward("01:12:00");
  await expect(page.locator(".timer-digits")).toHaveText(/^01:12:0\d$/);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await expect(page.getByRole("heading", { name: "Shift saved" })).toBeVisible();
  await expect(page.getByText(/Shift saved · 1h 12m/)).toBeVisible();
  await waitForSave(page);
  await goToWeek(page);
  await expect(page.getByRole("button", { name: /Edit 08:00 to 09:12 shift on 2026-11-11/ })).toBeVisible();
  await expect(page.locator(".week-heading")).toContainText("1h 12m");
});

test("undo a finished shift resumes the timer", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.clock.fastForward("00:30:00");
  await page.getByRole("button", { name: "Finish shift" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: "Shift in progress" })).toBeVisible();
  await expect(page.locator(".timer-digits")).toHaveText(/^00:30:0\d$/);
});

test("a running shift survives a reload", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.getByLabel("Shift note").fill("Draft that should survive");
  await waitForSave(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shift in progress" })).toBeVisible();
  await expect(page.getByLabel("Shift note")).toHaveValue("Draft that should survive");
});

test("edit a shift's times from Week", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-10T07:00", "2026-11-10T09:00");
  await goToWeek(page);
  await page.getByRole("button", { name: /Edit 07:00 to 09:00 shift on 2026-11-10/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit shift" });
  await expect(dialog.getByRole("heading", { name: "Edit shift" })).toBeVisible();
  await dialog.getByLabel("End date & time").fill("2026-11-10T10:30");
  await dialog.getByRole("button", { name: /Save shift/ }).click();
  await expect(page.getByRole("button", { name: /Edit 07:00 to 10:30 shift on 2026-11-10/ })).toBeVisible();
  await expect(page.locator(".week-heading")).toContainText("3h 30m");
});

test("an overlapping shift asks before saving", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-10T07:00", "2026-11-10T09:00");
  const messages: string[] = [];
  page.once("dialog", dialog => { messages.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Add a past shift" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit shift" });
  await dialog.getByLabel("Start date & time").fill("2026-11-10T08:00");
  await dialog.getByLabel("End date & time").fill("2026-11-10T10:00");
  await dialog.getByRole("button", { name: /Save shift/ }).click();
  await expect(dialog).toBeVisible();
  expect(messages.join("\n")).toMatch(/overlap/i);
});

test("delete a shift from All shifts", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-09T07:00", "2026-11-09T08:00");
  await goToWeek(page);
  await page.getByText("All shifts & exports").click();
  await page.locator(".shift-summary").first().click();
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Your shifts will show up here")).toBeVisible();
  await expect(page.locator(".week-heading")).toContainText("0m");
});

test("add a shift from a template", async ({ page }) => {
  await openApp(page);
  await goToWeek(page);
  await page.getByText("Add from a template").click();
  await page.locator(".template-choice").first().click();
  const dialog = page.getByRole("dialog", { name: "Edit shift" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Save shift/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".week-shift")).toHaveCount(1);
});

test("download a backup and restore it with Merge", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-09T07:00", "2026-11-09T08:30", "Backed up note");
  await waitForSave(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Backups" }).click();
  const downloadPromise = page.waitForEvent("download");
  await settings.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup.shifts).toHaveLength(1);
  expect(backup.geminiApiKey).toBeUndefined();
  // Change the data, then merge the backup back in.
  await settings.getByRole("button", { name: "Close" }).click();
  await addPastShift(page, "2026-11-10T07:00", "2026-11-10T08:00");
  await page.getByRole("button", { name: "Settings" }).click();
  await settings.getByRole("button", { name: "Backups" }).click();
  await settings.locator('input[type="file"]').setInputFiles(file);
  const preview = page.getByRole("dialog", { name: "Restore preview" });
  await expect(preview).toContainText("1 shifts in this file. You currently have 2.");
  await preview.getByRole("button", { name: "Merge with my records" }).click();
  await expect(preview).toBeHidden();
  await expect(page.getByText(/Backup merged/)).toBeVisible();
  await page.keyboard.press("Escape");
  await goToWeek(page);
  await expect(page.locator(".week-shift")).toHaveCount(2);
});

test("the weekly export builds its Excel file", async ({ page }) => {
  await openApp(page);
  await addPastShift(page, "2026-11-10T07:00", "2026-11-10T09:15");
  await goToWeek(page);
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Weekly timesheet" });
  await expect(sheet).toContainText("Total worked2:15");
  const download = sheet.getByRole("button", { name: "Download Excel" });
  await expect(download).toBeEnabled({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent("download");
  await download.click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
});

test("with no shift running, nothing on screen changes for three seconds", async ({ page }) => {
  await openApp(page);
  await waitForSave(page);
  await page.waitForTimeout(600); // let the entrance animation finish
  const changes = await page.evaluate(() => new Promise<number>(resolve => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 3000);
  }));
  expect(changes).toBe(0);
});

test("only the timer digits change while a shift runs", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await waitForSave(page);
  const changed = await page.evaluate(() => new Promise<string[]>(resolve => {
    const targets = new Set<string>();
    const observer = new MutationObserver(records => records.forEach(r => {
      const el = r.target instanceof Element ? r.target : r.target.parentElement;
      targets.add(el?.closest(".timer-digits") ? "timer-digits" : el?.className || el?.tagName || "?");
    }));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    setTimeout(() => { observer.disconnect(); resolve([...targets]); }, 2500);
  }));
  expect(changed).toEqual(["timer-digits"]);
});

test("switching between Today and Week keeps data", async ({ page }) => {
  await openApp(page, { now: FIXED_NOW });
  await addPastShift(page, "2026-11-11T05:00", "2026-11-11T06:00");
  await goToWeek(page);
  await goToToday(page);
  await expect(page.locator(".week-peek")).toContainText("1h");
});
