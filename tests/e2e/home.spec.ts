import { expect, test, type Page } from "@playwright/test";
import { FIXED_NOW, QUIET_NOW, installClock } from "./helpers";

// The app at "/" in the Headlight design, on the real saved records.
async function openHome(page: Page, path = "/") {
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await installClock(page, FIXED_NOW);
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
  // Reload only once the draft is in the device database.
  const savedDraft = () => page.evaluate(() => new Promise<string>(resolve => {
    const open = indexedDB.open("routehours", 1);
    open.onsuccess = () => { const get = open.result.transaction("state").objectStore("state").get("app"); get.onsuccess = () => resolve(get.result?.data?.noteDraft ?? ""); get.onerror = () => resolve(""); };
    open.onerror = () => resolve("");
  }));
  await expect.poll(async () => { await page.clock.fastForward(500); return savedDraft(); }).toBe("Bus 1123 had a flat");
  await page.reload();
  await page.getByRole("button", { name: "Add a note" }).click();
  await expect(page.getByRole("dialog").getByLabel("New note")).toHaveValue("Bus 1123 had a flat");
  // The test clock is paused, so step it (and press Escape again if the sheet wasn't listening yet) until the sheet is gone.
  const dialogs = page.getByRole("dialog");
  await expect.poll(async () => { if (await dialogs.count()) await page.keyboard.press("Escape"); await page.clock.fastForward(200); return dialogs.count(); }, { timeout: 15_000 }).toBe(0);
  await page.clock.fastForward(20 * 60_000);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await page.getByRole("button", { name: /Edit Today's shift/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Bus 1123 had a flat");
});

test("home: unreadable data shows recovery right here, without leaving the screen", async ({ page }) => {
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await page.addInitScript(() => localStorage.setItem("routehours:v1", JSON.stringify({ storageVersion: 2 })));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your data needs attention" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original data" }).click();
  expect((await download).suggestedFilename()).toBe("routehours-original-data.json");
  await expect(page.getByRole("button", { name: "Restore a backup file" })).toBeVisible();
});

// Omar, 15 Nov: "very very laggy", "keeps flickering". Each check below pins one cause that was found.
test.describe("home: smooth on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
    await installClock(page, QUIET_NOW);
  });

  test("nothing loops, at rest or on shift, so the blurred cards are drawn once and left alone", async ({ page }) => {
    await page.goto("/");
    const start = page.getByRole("button", { name: "Start shift" });
    await expect(start).toBeVisible();
    const loops = () => page.evaluate(() => ({
      css: document.getAnimations().filter(a => a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity).map(a => (a as CSSAnimation).animationName),
      svg: document.querySelectorAll("animate, animateMotion, animateTransform, set").length,
    }));
    expect(await loops()).toEqual({ css: [], svg: 0 });
    await start.click();
    await expect(page.getByRole("button", { name: "Finish shift" })).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await loops()).toEqual({ css: [], svg: 0 });
  });

  test("a notice leaving on Start slides the cards up instead of making them jump", async ({ page }) => {
    await page.goto("/");
    // Fresh records still have the starter shifts, so the "Set them" notice sits above the cards.
    await expect(page.getByText(/still have the starter times/)).toBeVisible();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const button = document.querySelector("[class*=mainButton]")!;
      const tops: number[] = [];
      (window as unknown as { tops: number[] }).tops = tops;
      const sample = () => { tops.push(button.getBoundingClientRect().top); if (tops.length < 70) requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
    });
    await page.getByRole("button", { name: "Start shift" }).click();
    await page.waitForFunction(() => (window as unknown as { tops: number[] }).tops.length >= 70);
    const tops = await page.evaluate(() => (window as unknown as { tops: number[] }).tops);
    const moved = tops[0] - tops.at(-1)!;
    expect(moved, "the notice left, so the button ends higher up").toBeGreaterThan(30);
    const biggestStep = Math.max(...tops.slice(1).map((top, i) => Math.abs(top - tops[i])));
    expect(biggestStep, "no single frame jumps most of the way").toBeLessThan(moved * 0.5);
  });

  test("opening shows this phone's wallpaper from the first frame, never another scene first", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("routehours:wallpaper", "ocean");
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      new MutationObserver(() => {
        document.querySelectorAll<HTMLElement>("[class*=wallpaper-module][class*=plate]").forEach(plate => {
          const sky = plate.style.getPropertyValue("--sky-top");
          if (!seen.includes(sky)) seen.push(sky);
        });
      }).observe(document, { subtree: true, childList: true });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start shift" })).toBeVisible();
    // The page is coloured with the ocean sky before anything is drawn, then only ocean plates appear.
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--page-bg"))).toBe("#A9BEE8");
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["#A9BEE8", "#E9C3CF"]);
  });

  test("buttons floating on the wallpaper are frosted like the cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start shift" })).toBeVisible();
    for (const name of ["Settings", "Voice note", "Add a past shift", /Start your .* shift|Log your usual day/]) {
      const button = page.getByRole("button", { name, exact: typeof name === "string" }).first();
      expect(await button.evaluate(el => getComputedStyle(el).backdropFilter), String(name)).toContain("blur");
    }
  });
});

test("home: the usual day only adds the parts that aren't logged yet", async ({ page }) => {
  // 16:00 in Copenhagen: both starter parts (07:00–09:00, 13:00–15:00) are over, so the chip offers the usual day.
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await installClock(page, new Date("2026-11-11T15:00:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Add a past shift" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Day").fill("2026-11-11");
  await sheet.getByLabel("Started").fill("07:00");
  await sheet.getByLabel(/Finished/).fill("09:00");
  await sheet.getByRole("button", { name: "Save" }).click();
  await toast(page, "Shift added · 2:00");
  await page.getByRole("button", { name: "Log your usual day" }).click();
  await toast(page, "Usual day logged · 2:00");
  await page.getByRole("button", { name: "Log your usual day" }).click();
  await toast(page, "Your usual shifts are already logged for today");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByText(/overlap|same times/)).toHaveCount(0);
});

test("home: Review & send keeps its week when Sunday turns into Monday while it is open", async ({ page }) => {
  // 23:59 on Sunday 15 November in Copenhagen, reviewing the week of 9–15 November.
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await installClock(page, new Date("2026-11-15T22:59:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await expect(sheet.getByText("09.11.2026 – 15.11.2026", { exact: false })).toBeVisible();
  await page.clock.runFor(2 * 60_000);
  await expect(sheet.getByText("09.11.2026 – 15.11.2026", { exact: false })).toBeVisible();
  await expect(sheet.getByText("16.11.2026", { exact: false })).toHaveCount(0);
});

test("home: Review & send can fix one time of a shift that ends in the hour repeated when the clocks go back", async ({ page }) => {
  // 01:30 summer time on Sunday 25 October 2026; the shift runs two real hours and finishes at 02:30 winter time.
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await installClock(page, new Date("2026-10-24T23:30:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.clock.fastForward(120 * 60_000);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await toast(page, "Shift saved · 2:00");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Review & send" });
  await sheet.getByRole("button", { name: /^Sun/ }).click();
  // Fixing only the start keeps the recorded 02:30 finish instead of refusing it as ambiguous.
  await sheet.getByLabel("Start", { exact: true }).fill("01:45");
  await expect(page.getByText(/occurs twice/)).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /^Sun/ })).toContainText("01:45–02:30");
  await expect(sheet.getByRole("button", { name: /^Sun/ })).toContainText("1:45");
});

test.describe("home: installing on an iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });

  test("Install explains Safari's Share menu, since iPhones never offer an install prompt", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: "Settings", exact: true }).last().click();
    await page.getByRole("button", { name: "Install" }).click();
    await expect(page.getByText(/In Safari, tap Share/)).toBeVisible();
    await expect(page.getByText(/In Chrome, tap ⋮/)).toHaveCount(0);
  });
});

test("home: a usual run nobody finished still stops on its own while the Week tab is open", async ({ page }) => {
  // 06:45 on Wednesday 11 November in Copenhagen, with the 06:45–08:10 + 12:25–14:45 split day.
  await page.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
  await installClock(page, new Date("2026-11-11T05:45:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).last().click();
  await page.getByRole("button", { name: "Use these" }).click();
  await toast(page, "Usual shifts saved");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Start your morning shift" }).click();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  // 09:12, more than an hour past the usual 08:10 end, with Today never shown again.
  await page.clock.fastForward(147 * 60_000);
  await toast(page, "Finished on its own at 08:10");
  await expect(page.getByText("06:45–08:10")).toBeVisible();
});
