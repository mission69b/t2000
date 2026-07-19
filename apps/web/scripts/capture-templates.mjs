// Full-page template screenshots (motionsites-style previews).
//
// Usage: node scripts/capture-templates.mjs [slug ...]
//
// Renders each scripts/template-previews/<slug>.html in headless Chrome
// (the system install — no bundled browser download) and writes a
// full-page PNG to public/templates/<slug>.png. Cards top-crop the image;
// the gallery modal scrolls the whole capture.
//
// These static previews are faithful renders of what each prompt builds
// (minus animation). Long-term, replace them with captures of real
// t2 code builds — that doubles as a prompt eval.
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "template-previews");
const OUT = join(here, "..", "public", "template-previews");

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const requested = process.argv.slice(2);
const all = (await readdir(SRC)).filter((f) => f.endsWith(".html"));
const targets = requested.length
  ? all.filter((f) => requested.includes(f.replace(/\.html$/, "")))
  : all;

if (targets.length === 0) {
  console.error("no matching preview html files");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--force-device-scale-factor=2", "--hide-scrollbars"],
});

try {
  for (const file of targets) {
    const slug = file.replace(/\.html$/, "");
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(`file://${join(SRC, file)}`, { waitUntil: "networkidle0" });
    // Let fonts/layout settle.
    await new Promise((r) => setTimeout(r, 400));
    const out = join(OUT, `${slug}.png`);
    await page.screenshot({ path: out, fullPage: true });
    await page.close();
    console.log(`✓ ${slug}.png`);
  }
} finally {
  await browser.close();
}
