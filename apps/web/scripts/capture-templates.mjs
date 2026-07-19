// Full-page template screenshots (motionsites-style previews).
//
// Usage:
//   node scripts/capture-templates.mjs [slug ...]        # static previews
//   node scripts/capture-templates.mjs slug=http://...   # real build at URL
//
// Static mode renders scripts/template-previews/<slug>.html; URL mode
// captures a running app (a real t2 code build — the preferred source).
// Both write a full-page PNG to public/template-previews/<slug>.png.
// Cards top-crop the image; the gallery modal scrolls the whole capture.
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

// Each target is { slug, url }: static previews use file:// URLs, real
// builds pass slug=http://host:port.
const args = process.argv.slice(2);
const urlTargets = args
  .filter((a) => a.includes("="))
  .map((a) => {
    const [slug, ...rest] = a.split("=");
    return { slug, url: rest.join("=") };
  });
const staticRequested = args.filter((a) => !a.includes("="));
const all = (await readdir(SRC)).filter((f) => f.endsWith(".html"));
const staticTargets = (
  urlTargets.length && !staticRequested.length
    ? []
    : staticRequested.length
      ? all.filter((f) => staticRequested.includes(f.replace(/\.html$/, "")))
      : all
).map((f) => ({
  slug: f.replace(/\.html$/, ""),
  url: `file://${join(SRC, f)}`,
}));
const targets = [...staticTargets, ...urlTargets];

if (targets.length === 0) {
  console.error("no matching targets");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--force-device-scale-factor=2", "--hide-scrollbars"],
});

try {
  for (const { slug, url } of targets) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle0" });
    // Let fonts/layout settle; scroll through once so whileInView /
    // scroll-triggered animations fire before the full-page capture.
    await page.evaluate(async () => {
      const step = window.innerHeight / 2;
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 600));
    const out = join(OUT, `${slug}.png`);
    await page.screenshot({ path: out, fullPage: true });
    await page.close();
    console.log(`✓ ${slug}.png ← ${url}`);
  }
} finally {
  await browser.close();
}
