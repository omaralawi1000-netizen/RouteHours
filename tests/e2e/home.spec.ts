import { expect, test, type Page } from "@playwright/test";
import { FIXED_NOW } from "./helpers";

// The app at "/" in the Headlight design, on the real saved records.
async function openHome(page: Page, path = "/") {
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.clock.install({ time: FIXED_NOW });
  await page.goto(path);
  await expect(page.getByRole("button", { name: /Start shift|Finish shift/ })).toBeVisible();
}
const toast = (page: Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();

test("home: start, finish and undo a shift on the real records", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.clock.fastForward(25 * 60_000);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await toast(page, "Shift saved · 0:25");
  await expect(page.getByRole("button", { name: /Edit Today's shift, 08:00 to 08:25/ })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await toast(page, "Shift resumed");
  await expect(page.getByRole("button", { name: "Finish shift" })).toBeVisible();
  // It survives a reload: the timer is part of the saved records.
  await page.reload();
  await expect(page.getByRole("button", { name: "Finish shift" })).toBeVisible();
});

test("home: a break saves the first part, and Resume starts the next one", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.clock.fastForward(30 * 60_000);
  await page.getByRole("button", { name: "Break", exact: true }).click();
  await toast(page, "Break started. 0:30 saved so far.");
  await page.clock.fastForward(15 * 60_000);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.fastForward(20 * 60_000);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await toast(page, "Shift saved · 0:50");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByText("08:00–08:30 + 08:45–09:05")).toBeVisible();
  await expect(page.getByText(/overlap/)).toHaveCount(0);
});

test("home: add, edit and delete a past shift, with Undo", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Add a past shift" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Day").fill("2026-11-10");
  await sheet.getByLabel("Started").fill("06:45");
  await sheet.getByLabel(/Finished/).fill("08:10");
  await sheet.getByRole("button", { name: "Save" }).click();
  await toast(page, "Shift added · 1:25");
  await expect(page.getByRole("button", { name: /Edit Yesterday's shift, 06:45 to 08:10/ })).toBeVisible();

  await page.getByRole("button", { name: /Edit Yesterday's shift/ }).click();
  await page.getByRole("dialog").getByLabel(/Finished/).fill("08:30");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Shift updated");
  await expect(page.getByRole("button", { name: /Edit Yesterday's shift, 06:45 to 08:30/ })).toBeVisible();

  await page.getByRole("button", { name: /Edit Yesterday's shift/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Shift deleted");
  await expect(page.getByRole("button", { name: /Edit Yesterday's shift/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /Edit Yesterday's shift, 06:45 to 08:30/ })).toBeVisible();
});

test("home: the split day from Settings drives the quick start chip", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Settings", exact: true }).last().click();
  await page.getByRole("button", { name: "Use these" }).click();
  await toast(page, "Usual shifts saved");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start your morning shift" })).toContainText("06:45");
  await page.getByRole("button", { name: "Start your morning shift" }).click();
  // Wednesday 08:00, tapped 75 min after the usual 06:45 start: offer to move it back.
  await expect(page.getByText("Started at 06:45? You tapped Start at 08:00.")).toBeVisible();
  await page.getByRole("button", { name: "Use 06:45" }).click();
  await toast(page, "Start moved to 06:45");
});

test("home: marking today sick and reviewing the week", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("radio", { name: "Sick" }).click();
  await toast(page, "Today marked sick");
  await expect(page.getByRole("button", { name: /Add a shift on Wednesday/ })).toContainText("Syg");
  await page.getByRole("button", { name: "Review & send" }).click();
  await expect(page.getByRole("dialog", { name: "Review & send" })).toBeVisible();
});

test("home: the Start shortcut and reminder link start a shift", async ({ page }) => {
  await openHome(page, "/?do=start");
  await expect(page.getByRole("button", { name: "Finish shift" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("home: the name and payroll number fields stay open while you fill them in", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await sheet.getByRole("textbox", { name: "Your name", exact: true }).fill("Omar");
  await sheet.getByRole("textbox", { name: "Løn-nr.", exact: true }).pressSequentially("12");
  await expect(sheet.getByRole("textbox", { name: "Løn-nr.", exact: true })).toHaveValue("12");
  await expect(sheet.getByRole("textbox", { name: "Your name", exact: true })).toHaveValue("Omar");
});

test("home: a typed note survives a reload and is saved with the shift", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.getByRole("button", { name: "Add a note" }).click();
  await page.getByRole("dialog").getByLabel("New note").fill("Bus 1123 had a flat");
  await page.clock.fastForward(2_000);
  await page.reload();
  await page.getByRole("button", { name: "Add a note" }).click();
  await expect(page.getByRole("dialog").getByLabel("New note")).toHaveValue("Bus 1123 had a flat");
  await page.keyboard.press("Escape");
  await page.clock.fastForward(20 * 60_000);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await page.getByRole("button", { name: /Edit Today's shift/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Bus 1123 had a flat");
});
