import { expect, test } from "@playwright/test";

// The hidden design lab: a quick check that its demos work and it never pulls in the old styles.
test("lab: a shift starts, finishes into the week, and can be undone", async ({ page }) => {
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.goto("/lab");
  await expect(page.locator(`[aria-label="15:07 worked this week"]`)).toBeVisible();
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.getByRole("button", { name: "Lab: jump 1 hour" }).click();
  await page.getByRole("button", { name: "Finish shift" }).click();
  await expect(page.getByText("Shift saved")).toBeVisible();
  await expect(page.locator(`[aria-label="16:07 worked this week"]`)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Finish shift" })).toBeVisible();
});

test("lab: the sheet closes with Escape and with Back", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Edit Tuesday's shift" }).click();
  await expect(page.getByRole("dialog", { name: "Tuesday's shift" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Tuesday's shift" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/lab$/);
});

test("lab: a break pauses the shift and the wallpaper choice is remembered", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.getByRole("button", { name: "Break", exact: true }).click();
  await expect(page.getByText("Take your time. The clock is paused.")).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Break", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await page.getByRole("radio", { name: "Fjord Moon" }).click();
  await expect(page.getByRole("radio", { name: "Fjord Moon" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Fjord Moon" })).toHaveAttribute("aria-checked", "true");
});
