import { expect, test, type Page } from "@playwright/test";

// The lab's Gemini features with a fake microphone and a faked /api/ai, so no key or internet is needed.
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, permissions: ["microphone"] });

type Body = { task: string; key: string; question?: string; context?: string; audio?: { type: string; data: string }; image?: { type: string; data: string } };
async function fakeGemini(page: Page, answers: Partial<Record<string, unknown>>) {
  const seen: Body[] = [];
  await page.route("**/api/ai", async route => {
    const body = route.request().postDataJSON() as Body;
    seen.push(body);
    await route.fulfill({ json: answers[body.task] ?? { ok: true } });
  });
  return seen;
}
async function withKey(page: Page) {
  await page.addInitScript(() => localStorage.setItem("routehours:lab-gemini", "AIzaTestKey1234"));
}

test("lab AI: pasting a Gemini key checks it and saves it on the phone", async ({ page }) => {
  const seen = await fakeGemini(page, {});
  await page.goto("/lab");
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await page.getByLabel("Gemini API key").fill("AIzaTestKey9876");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Gemini is connected")).toBeVisible();
  await expect(page.getByText("Key ending in 9876.", { exact: false })).toBeVisible();
  expect(seen[0]).toEqual({ task: "test", key: "AIzaTestKey9876" });
});

test("lab AI: without a key, the mic points to where the key goes", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Voice note" }).click();
  await expect(page.getByText("Paste your Gemini key in Lab first")).toBeVisible();
});

test("lab AI: a spoken note on shift is written down by Gemini and saved with the shift", async ({ page }) => {
  await withKey(page);
  const seen = await fakeGemini(page, { listen: { text: "Late from Aarhus C, roadworks" } });
  await page.goto("/lab");
  await page.getByRole("button", { name: "Start shift" }).click();
  await page.getByRole("button", { name: "Voice note" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Note added: Late from Aarhus C, roadworks")).toBeVisible();
  expect(seen[0].task).toBe("listen");
  expect(seen[0].audio?.type).toMatch(/^audio\//);
  await page.getByRole("button", { name: "Finish shift" }).click();
  await expect(page.getByText("Late from Aarhus C, roadworks", { exact: false }).first()).toBeVisible();
});

test("lab AI: ask your hours sends the logged days and shows the answer", async ({ page }) => {
  await withKey(page);
  const seen = await fakeGemini(page, { ask: { answer: "Last week you worked 31:13." } });
  await page.goto("/lab");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByLabel("Question about your hours").fill("How much did I work last week?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Last week you worked 31:13.")).toBeVisible();
  expect(seen[0].question).toBe("How much did I work last week?");
  expect(seen[0].context).toContain("2026-11-02 Mon: 7:50");
});

test("lab AI: a payslip photo is compared with the logged hours", async ({ page }) => {
  await withKey(page);
  await fakeGemini(page, { payslip: { payslip: { periodStart: "2026-10-26", periodEnd: "2026-11-08", hours: 60, hourlyRate: 180, grossPay: 10800 } } });
  await page.goto("/lab");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  // A 1x1 PNG stands in for the photo.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Payslip photo").setInputFiles({ name: "payslip.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("5:19 missing on the payslip", { exact: false })).toBeVisible();
  await expect(page.getByText("957 kr", { exact: false })).toBeVisible();
});

test.describe("lab: forgot to start", () => {
  test("starting 20 minutes late offers the usual start time", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-13T06:05:00Z")); // Friday 07:05 in Copenhagen
    await page.goto("/lab");
    await page.getByRole("button", { name: "Start shift" }).click();
    await expect(page.getByText("Started at 06:45? You tapped Start at 07:05.")).toBeVisible();
    await page.getByRole("button", { name: "Use 06:45" }).click();
    await expect(page.getByText("Start moved to 06:45")).toBeVisible();
    await expect(page.getByText("Started at 06:45?", { exact: false })).toHaveCount(0);
  });
});
