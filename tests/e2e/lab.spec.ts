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

test("lab: deleting a shift takes its hours off the week, and Undo puts them back", async ({ page }) => {
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.goto("/lab");
  await expect(page.locator(`[aria-label="15:07 worked this week"]`)).toBeVisible();
  await page.getByRole("button", { name: "Edit Tuesday's shift" }).click();
  await page.getByRole("dialog", { name: "Tuesday's shift" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(`[aria-label="7:45 worked this week"]`)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(`[aria-label="15:07 worked this week"]`)).toBeVisible();
  // Delete it again: the Week bars and the timesheet agree with Today.
  await page.getByRole("button", { name: "Edit Tuesday's shift" }).click();
  await page.getByRole("dialog", { name: "Tuesday's shift" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("img", { name: /^M 7\.8 hours, T 0 hours/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Review & send" }).click();
  await expect(page.getByRole("dialog", { name: "Review & send" }).getByText("7:45 worked", { exact: false })).toBeVisible();
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

  test("an auto-finished run only subtracts breaks taken before its usual end", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T05:45:00Z")); // 06:45
    await page.goto("/lab");
    await page.getByRole("button", { name: "Start your morning shift" }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T07:20:00Z")); // 08:20, after the usual 08:10 end
    await page.getByRole("button", { name: "Break", exact: true }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T07:35:00Z")); // 08:35
    await page.getByRole("button", { name: "Resume" }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T08:12:00Z")); // 09:12: stops itself, logged at 08:10
    await expect(page.getByText("Finished on its own at 08:10")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Edit Today's shift" }).first()).toContainText("1:25");
  });

  test("a break splits the shift on the timesheet, and its total matches the logged hours", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T05:45:00Z")); // Friday 06:45
    await page.goto("/lab");
    await page.getByRole("button", { name: "Start your morning shift" }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T06:00:00Z")); // 07:00
    await page.getByRole("button", { name: "Break", exact: true }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T06:30:00Z")); // 07:30
    await page.getByRole("button", { name: "Resume" }).click();
    await page.clock.setFixedTime(new Date("2026-11-13T07:00:00Z")); // 08:00
    await page.getByRole("button", { name: "Finish shift" }).click();
    await expect(page.getByRole("button", { name: "Edit Today's shift" }).first()).toContainText("0:45");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await page.getByRole("button", { name: "Review & send" }).click();
    const friday = page.getByRole("dialog", { name: "Review & send" }).getByRole("button", { name: /^Fri/ });
    await expect(friday).toContainText("06:45–07:00");
    await expect(friday).toContainText("07:30–08:00");
    await expect(friday).toContainText("0:45");
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

test("lab: review & send shows the real sheet, edits a day in place and downloads the Excel", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await expect(sheet.getByText("15:07 worked", { exact: false })).toBeVisible();
  // Tuesday ends an hour later: the day, the total and the sheet all follow.
  await sheet.getByRole("button", { name: /^Tue/ }).click();
  await sheet.getByLabel("End", { exact: true }).fill("14:34");
  await expect(sheet.getByRole("button", { name: /^Tue/ })).toContainText("8:22");
  await expect(sheet.getByText("16:07 worked", { exact: false })).toBeVisible();
  // Mark Wednesday sick: it shows on the day (and as an x in the Syg column of the sheet).
  await sheet.getByRole("button", { name: /^Wed/ }).click();
  await sheet.getByRole("radiogroup", { name: "Wednesday was" }).getByRole("radio", { name: "Sick" }).click();
  await expect(sheet.getByRole("button", { name: /^Wed/ })).toContainText("Sick");
  const download = page.waitForEvent("download");
  await sheet.getByRole("button", { name: "Download Excel" }).click();
  expect((await download).suggestedFilename()).toBe("RouteHours-uge-46.xlsx");
  // Sending needs a recipient; in the lab it is only a demo.
  await expect(sheet.getByRole("button", { name: /Add who it goes to/ })).toBeDisabled();
  await sheet.getByRole("textbox", { name: "To", exact: true }).fill("boss@example.com");
  const send = sheet.getByRole("button", { name: /Hold to send/ });
  await send.hover(); await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
  await expect(page.getByText("Demo: nothing was sent.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "See what was sent" })).toBeVisible();
});

test.describe("lab: smooth on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
    await page.goto("/lab");
  });

  test("the wallpaper stays put while the page scrolls", async ({ page }) => {
    const wall = page.locator("[class*=wallpaper-module][class*=wall]").first();
    const before = await wall.evaluate(el => [el.getBoundingClientRect().top, el.querySelector("svg")!.getBoundingClientRect().top]);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await wall.evaluate(el => [el.getBoundingClientRect().top, el.querySelector("svg")!.getBoundingClientRect().top])).toEqual(before);
  });

  test("only cards and bars pay for a blur, and nothing under them repaints in a loop", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start shift" })).toBeVisible();
    const blurred = await page.evaluate(() => [...document.querySelectorAll("*")].filter(el => getComputedStyle(el).backdropFilter !== "none").length);
    expect(blurred).toBeLessThanOrEqual(3);
    const loops = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).map(a => (a as CSSAnimation).animationName));
    expect(loops.every(name => /drift/.test(name))).toBe(true);
  });

  test("every tab fits the screen width", async ({ page }) => {
    for (const tab of ["Today", "Week", "Lab"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await page.waitForTimeout(600);
      const width = await page.locator("main").first().evaluate(el => el.getBoundingClientRect().width);
      expect(width, tab).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
    }
  });

  test("the card below the clock doesn't hop on Start, and a break never counts below zero", async ({ page }) => {
    const button = page.getByRole("button", { name: "Start shift" });
    const top = async () => (await page.getByRole("button", { name: /Start shift|Finish shift/ }).boundingBox())!.y;
    await page.waitForTimeout(1200); // let the page's entrance settle
    const idle = await top();
    await button.click();
    await page.waitForTimeout(900);
    expect(Math.abs((await top()) - idle)).toBeLessThan(1);
    await page.getByRole("button", { name: "Break", exact: true }).click();
    await page.waitForTimeout(150);
    await expect(page.locator("main")).not.toContainText("-1");
  });
});

test("lab: a shift logged after editing the timesheet still lands on it, and the edit stays", async ({ page }) => {
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.goto("/lab");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await sheet.getByRole("button", { name: /^Tue/ }).click();
  await sheet.getByLabel("End", { exact: true }).fill("14:34");
  await expect(sheet.getByText("16:07 worked", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // Log an hour on Today, then look again.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.getByRole("button", { name: "Lab: jump 1 hour" }).click();
  await page.getByRole("button", { name: "Finish shift" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Review & send" }).click();
  await expect(sheet.getByText("17:07 worked", { exact: false })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Tue/ })).toContainText("8:22");
});
