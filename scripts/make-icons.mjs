// Renders the app icons in public/ from the SVGs in scripts/icons with the Chromium Playwright
// already uses for the tests. Run: node scripts/make-icons.mjs
//
// Android (Chrome install) uses the maskable icon: full bleed, the launcher crops it to its own
// shape, so the bus sits in the middle third. The monochrome icon is Android's themed icon (Material
// You), tinted by the launcher. "any" icons are rounded for browsers and desktop; Apple rounds its own.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const dir = new URL("./icons/", import.meta.url), out = new URL("../public/", import.meta.url);
const jobs = [
  { svg: "icon.svg", file: "icon-512-v4.png", size: 512, clip: "inset(0 round 22%)" },
  { svg: "icon.svg", file: "icon-192-v4.png", size: 192, clip: "inset(0 round 22%)" },
  { svg: "icon.svg", file: "icon-maskable-v4.png", size: 512 },
  { svg: "icon.svg", file: "apple-icon-v4.png", size: 180 },
  { svg: "monochrome.svg", file: "icon-monochrome-v4.png", size: 512 },
  { svg: "monochrome.svg", file: "badge-v4.png", size: 96 },
  { svg: "shortcut-start.svg", file: "shortcut-start-v2.png", size: 192 },
  { svg: "shortcut-finish.svg", file: "shortcut-finish-v2.png", size: 192 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { svg, file, size, clip } of jobs) {
  const markup = readFileSync(new URL(svg, dir), "utf8").replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;${clip ? `clip-path:${clip}` : ""}">${markup}</div></body>`);
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: true });
  console.log(file);
}
await browser.close();
