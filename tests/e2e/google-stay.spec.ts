import { expect, test } from "@playwright/test";
import { FIXED_NOW, addPastShift, goToWeek, openApp } from "./helpers";

const clientId = "123-stay.apps.googleusercontent.com";

test("pasting the Web client JSON saves the secret for staying signed in", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Connections" }).click();
  await settings.getByLabel(/Google Web client ID/).fill(JSON.stringify({ web: { client_id: clientId, client_secret: "GOCSPX-test123" } }));
  await expect(settings.getByText("Client secret saved from the JSON.", { exact: false })).toBeVisible();
  await settings.getByRole("button", { name: "Save Google client ID" }).click();
  expect(await page.evaluate(id => localStorage.getItem("routehours:google-secret:" + id), clientId)).toBe("GOCSPX-test123");
});

test("once signed in to stay, Gmail is ready to send with no Google window", async ({ page }) => {
  const asked: string[] = [];
  await page.route("**/api/google/session", async route => {
    const body = route.request().postDataJSON();
    asked.push(body.action);
    await route.fulfill({ json: { token: "ya29.test", expires: FIXED_NOW.getTime() + 3000_000, email: "driver@example.com", scope: "email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file" } });
  });
  await page.addInitScript(id => localStorage.setItem("routehours:google-stay:" + id, "driver@example.com"), clientId);
  await openApp(page);
  // Save the client ID the normal way.
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Connections" }).click();
  await settings.getByLabel(/Google Web client ID/).fill(clientId);
  await settings.getByRole("button", { name: "Save Google client ID" }).click();
  await expect(settings.getByText("On. Sending and backups work without a Google window.")).toBeVisible();
  await settings.getByRole("button", { name: "Close" }).click();

  await addPastShift(page, "2026-11-10T07:00", "2026-11-10T09:15");
  await goToWeek(page);
  await page.getByRole("button", { name: "Review & send" }).click();
  const sheet = page.getByRole("dialog", { name: "Weekly timesheet" });
  await sheet.getByRole("button", { name: /Continue to email/ }).click({ timeout: 15_000 });
  const email = page.getByRole("dialog", { name: "Send with Gmail" });
  await expect(email.getByText("Sending from driver@example.com")).toBeVisible();
  await expect(email.getByRole("button", { name: /Send email with attachment/ })).toBeVisible();
  expect(asked).toContain("token");
  expect(asked).not.toContain("connect");
});
