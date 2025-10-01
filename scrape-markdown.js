import { chromium } from "playwright";
import fs from "fs-extra";
import path from "path";
import slugify from "slugify";
import matter from "gray-matter";

const BASE = process.argv[2] || "https://www.detoxretreatscolombia.com";
const OUTPUT_DIR = path.join(process.cwd(), "output/markdown");

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    return true;
  } catch {
    return false;
  }
}

function cleanContent(html) {
  html = html.replace(/<header[\s\S]*?<\/header>/gi, "");
  html = html.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  html = html.replace(/<section[^>]+post-main-actions-desktop[\s\S]*?<\/section>/gi, "");
  html = html.replace(/<button[^>]+data-hook="image-expand-button"[\s\S]*?<\/button>/gi, "");
  html = html.replace(/Recent Posts[\s\S]*$/i, "");
  html = html.replace(/©\s*20\d{2}[\s\S]*$/i, "");
  return html.trim();
}

async function scrape() {
  await fs.remove(OUTPUT_DIR);
  await fs.ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await safeGoto(page, BASE + "/blog");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(4000);

  const links = await page.$$eval("a[href*='/post/']", (els) =>
    els.map((a) => a.href)
  );

  for (const url of links) {
    if (!(await safeGoto(page, url))) continue;

    const title = await page.title();
    const slug = slugify(title, { lower: true, strict: true });
    let bodyHtml = await page.$eval("body", (el) => el.innerHTML);
    bodyHtml = cleanContent(bodyHtml);

    const dateMeta = await page
      .$eval('meta[property="article:published_time"]', (el) =>
        el.getAttribute("content")
      )
      .catch(() => null);

    const date = dateMeta || new Date().toISOString();

    const md = matter.stringify(bodyHtml, {
      title,
      slug,
      date,
      url,
      type: "post",
    });

    await fs.writeFile(path.join(OUTPUT_DIR, `${slug}.md`), md);
    console.log(`✅ Saved ${title} → ${slug}.md`);
  }

  await browser.close();
  console.log("🎉 Markdown export complete!");
}

scrape();
