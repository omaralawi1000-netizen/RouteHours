import { expect, test } from "@playwright/test";
import { openApp, waitForSave } from "./helpers";

// A fake microphone and a faked Groq reply exercise the whole dictation path without the internet.
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, permissions: ["microphone"] });

test("dictating a note with Groq adds the words to the note draft", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/transcribe", async route => {
    if (route.request().method() === "POST") { uploads++; await route.fulfill({ json: { text: "Passenger needed help with the ramp" } }); }
    else await route.fulfill({ json: { ready: true } });
  });
  await openApp(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Connections" }).click();
  await settings.getByText("Voice & AI").click();
  await settings.getByLabel(/Groq API key/).fill("gsk_test_key");
  await settings.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Start shift" }).click();
  await waitForSave(page);
  await page.getByRole("button", { name: "Dictate a note" }).click();
  await expect(page.getByText(/Listening · 0:0\d · tap mic to finish/)).toBeVisible();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Stop note recording" }).click();
  await expect(page.getByLabel("Shift note")).toHaveValue("Passenger needed help with the ramp");
  expect(uploads).toBe(1);
});

test("saying a start command asks for confirmation before the timer changes", async ({ page }) => {
  await page.route("**/api/transcribe", route => route.fulfill({ json: { text: "start shift" } }));
  await openApp(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Connections" }).click();
  await settings.getByText("Voice & AI").click();
  await settings.getByLabel(/Groq API key/).fill("gsk_test_key");
  await settings.getByRole("button", { name: "Close" }).click();
  await page.getByText("Ask or log with your voice").click();
  await page.getByRole("button", { name: "Dictate a question" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Stop question recording" }).click();
  await expect(page.getByText("Heard: “start shift”")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start shift" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm start" }).click();
  await expect(page.getByRole("heading", { name: "Shift in progress" })).toBeVisible();
});
