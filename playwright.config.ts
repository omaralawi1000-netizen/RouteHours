import { defineConfig, devices } from "@playwright/test";

// Browser tests drive the real production build in Chromium at the size of Omar's phone.
// Run `pnpm build` first; `pnpm test:e2e` starts the built app on port 3107.
const port = 3107;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 384, height: 854 },
    deviceScaleFactor: 1,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/Copenhagen",
    serviceWorkers: "block",
    trace: "off",
  },
  projects: [
    { name: "flows", testIgnore: /visual\.spec\.ts/ },
    // Pixel comparisons depend on the machine's fonts, so they only run where the baselines were made.
    { name: "visual", testMatch: /visual\.spec\.ts/ },
  ],
  webServer: { command: `pnpm start -p ${port} -H 127.0.0.1`, port, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
