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
  await expect(page.getByText(/Shift paused at .*Take your time/)).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Break", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await page.getByRole("radio", { name: "Fjord Moon" }).click();
  await expect(page.getByRole("radio", { name: "Fjord Moon" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Fjord Moon" })).toHaveAttribute("aria-checked", "true");
});

test.describe("lab: the usual split day", () => {
  test.use({ timezoneId: "Europe/Copenhagen" });

  test("in the morning the quick chip starts the morning run, and an overrun is flagged", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T05:42:00Z")); // Friday 06:42 in Copenhagen
    await page.goto("/lab");
    await page.getByRole("button", { name: "Start your morning shift" }).click();
    await expect(page.getByText("Morning shift started. Usually done at 08:10.")).toBeVisible();
    await page.clock.setFixedTime(new Date("2026-11-13T07:45:00Z")); // 08:45, past 08:10 + 30 min
    await expect(page.getByText("Your morning run usually ends at 08:10. Still driving?")).toBeVisible({ timeout: 70_000 });
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByText("Shift saved")).toBeVisible();
  });

  test("on a weekday evening with nothing logged, one tap logs the usual day", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T18:30:00Z")); // Friday 19:30
    await page.goto("/lab");
    await expect(page.getByText("Nothing logged today. Was it your usual day?")).toBeVisible();
    await page.getByRole("button", { name: "Log it" }).click();
    await expect(page.getByText("Usual day logged · 5:00")).toBeVisible();
    await expect(page.locator(`[aria-label="20:07 worked this week"]`)).toBeVisible();
    await expect(page.getByText("Nothing logged today. Was it your usual day?")).toBeHidden();
  });
});
