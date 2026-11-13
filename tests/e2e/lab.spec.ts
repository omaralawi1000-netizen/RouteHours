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
    await expect(page.getByText("Past 08:10. Still driving? It stops by itself at 09:10.")).toBeVisible({ timeout: 70_000 });
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByText("Shift saved")).toBeVisible();
  });

  test("a morning run nobody finished stops on its own, logged at the usual end", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T05:45:00Z")); // 06:45
    await page.goto("/lab");
    await page.getByRole("button", { name: "Start your morning shift" }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T08:12:00Z")); // 09:12, past 08:10 + 60 min
    await expect(page.getByText("Finished on its own at 08:10")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Start shift" })).toBeVisible();
  });

  test("tapping Still driving keeps the run going past the usual end", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T05:45:00Z"));
    await page.goto("/lab");
    await page.getByRole("button", { name: "Start your morning shift" }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T07:50:00Z")); // 08:50: the question shows, auto-stop not yet
    await page.getByRole("button", { name: "Still driving" }).click({ timeout: 70_000 });
    await page.clock.setFixedTime(new Date("2026-11-13T08:30:00Z")); // 09:30
    await page.waitForTimeout(2500);
    await expect(page.getByRole("button", { name: "Finish shift" })).toBeVisible();
    await expect(page.getByText(/finished on its own/i)).toHaveCount(0);
  });

  test("on a weekday evening with nothing logged, one tap logs the usual day", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T18:30:00Z")); // Friday 19:30
    await page.goto("/lab");
    await expect(page.getByText("Nothing logged today. Was it your usual day?")).toBeVisible();
    await page.getByRole("button", { name: "Log it" }).click();
    await expect(page.getByText("Usual day logged · 3:45")).toBeVisible();
    await expect(page.locator(`[aria-label="18:52 worked this week"]`)).toBeVisible();
    await expect(page.getByText("Nothing logged today. Was it your usual day?")).toBeHidden();
  });

  test("the leave-now card shows when it's time to head out, and can be turned off", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T05:30:00Z")); // 06:30, 15 min before 06:45
    await page.goto("/lab");
    await expect(page.getByText("Time to leave. Morning shift at 06:45.")).toBeVisible();
    await page.getByRole("button", { name: "Lab", exact: true }).click();
    await expect(page.getByText("Leave for the morning shift")).toBeVisible();
    await page.getByRole("radiogroup", { name: "Time to get there" }).getByRole("radio", { name: "Off" }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByText("Time to leave.", { exact: false })).toHaveCount(0);
  });

  test("the home-screen shortcuts start a shift, and Finish still finds it after the app was closed", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T11:20:00Z")); // 12:20
    await page.goto("/lab?do=start");
    await expect(page.getByText("Afternoon shift started. Usually done at 14:45.")).toBeVisible();
    await expect(page).toHaveURL(/\/lab$/);
    await page.clock.setFixedTime(new Date("2026-11-13T13:40:00Z")); // 14:40
    await page.goto("/lab?do=finish");
    await expect(page.getByText("Shift saved")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Start shift" })).toBeVisible();
  });
});
