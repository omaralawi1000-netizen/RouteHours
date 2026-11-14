// Measures the JavaScript the browser downloads for a page's first load.
// Usage: node scripts/first-load-js.mjs [route]   (run after `next build`)
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
const route = process.argv[2] || "index";
const html = readFileSync(`.next/server/app/${route}.html`, "utf8");
const scripts = [...new Set([...html.matchAll(/src="\/_next\/(static\/[^"]+\.js)"/g)].map(m => m[1]))];
let raw = 0, gz = 0;
for (const file of scripts) { const body = readFileSync(`.next/${file}`); raw += statSync(`.next/${file}`).size; gz += gzipSync(body).length; }
console.log(`${route}: ${scripts.length} scripts, ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped`);
