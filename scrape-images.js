import { chromium } from "playwright";
import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import slugify from "slugify";

const BASE = process.argv[2] || "https://www.detoxretreatscolombia.com";
const OUTPUT_DIR = path.join(process.cwd(), "output/images");

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.buffer();
    await fs.writeFile(filename, buf);
    return true;
  } catch (err) {
    console.warn(`⚠️ Failed to download ${url}: ${err.message}`);
    return false;
  }
}

async function scrape() {
  await fs.ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log(`🚀 Launching scraper at ${BASE}`);

  await safeGoto(page, BASE + "/blog");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(4000);

  const postLinks = await page.$$eval("a[href*='/post/']", (els) =>
    els.map((a) => a.href)
  );

  const results = [];

  for (const link of postLinks) {
    if (!(await safeGoto(page, link))) continue;

    const title = await page.title();
    const slug = slugify(title, { lower: true, strict: true });

    const images = await page.$$eval("img", (imgs) =>
      imgs.map((img) => img.src).filter((src) => src.startsWith("http"))
    );

    const postDir = path.join(OUTPUT_DIR, slug);
    await fs.ensureDir(postDir);

    for (const [i, imgUrl] of images.entries()) {
      const ext = path.extname(new URL(imgUrl).pathname) || ".jpg";
      const filename = path.join(postDir, `${slug}-${i}${ext}`);
      await downloadImage(imgUrl, filename);
    }

    results.push({ title, slug, images });
    console.log(`✅ ${title} → ${images.length} images`);
  }

  await browser.close();
  await fs.writeJson(path.join(OUTPUT_DIR, "images.json"), results, {
    spaces: 2,
  });

  console.log("🎉 Done! Images saved in ./output/images");
}

scrape();
