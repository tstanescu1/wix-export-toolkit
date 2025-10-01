import { chromium } from "playwright";
import fs from "fs-extra";
import path from "path";
import slugify from "slugify";
import { create } from "xmlbuilder2";

const BASE = process.argv[2] || "https://www.detoxretreatscolombia.com";
const OUTPUT_DIR = path.join(process.cwd(), "output");

/**
 * Safely navigate to a URL with retries
 */
async function safeGoto(page, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      return true;
    } catch (e) {
      console.warn(`⚠️ Goto failed (attempt ${attempt}) for ${url}:`, e.message);
    }
  }
  return false;
}

/**
 * Auto-scroll to trigger infinite load
 */
async function autoScroll(page) {
  let lastHeight = await page.evaluate("document.body.scrollHeight");
  while (true) {
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(4000);
    let newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
    console.log("⬇️ Scrolled, new height:", newHeight);
  }
}

/**
 * Expand FAQ dropdowns
 */
async function expandFAQs(page) {
  try {
    const dropdowns = await page.$$('[data-hook="expandIcon"], .sNKyLaH');
    for (const el of dropdowns) {
      try {
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(300);
      } catch {}
    }
    // Also force aria-hidden sections visible
    await page.$$eval('[aria-hidden="true"]', (nodes) => {
      nodes.forEach((n) => n.setAttribute("aria-hidden", "false"));
    });
    console.log(`✅ Expanded ${dropdowns.length} FAQ sections`);
  } catch {
    console.log("ℹ️ No expandable FAQs found");
  }
}

/**
 * Cleanup Wix junk from HTML
 */
function cleanContent(html) {
  if (!html) return "";

  // Kill headers & navbars
  html = html.replace(/<header[\s\S]*?<\/header>/gi, "");
  html = html.replace(/<nav[\s\S]*?<\/nav>/gi, "");

  // Remove social media/share sections
  html = html.replace(/<section[^>]+post-main-actions-desktop[\s\S]*?<\/section>/gi, "");

  // Remove expand buttons for images
  html = html.replace(/<button[^>]+data-hook="image-expand-button"[\s\S]*?<\/button>/gi, "");

  // Remove "Recent Posts" and below
  html = html.replace(/Recent Posts[\s\S]*$/i, "");

  // Remove "Stay updated!" sections
  html = html.replace(/Stay updated![\s\S]*$/i, "");

  // Remove footer © blocks
  html = html.replace(/©\s*20\d{2}[\s\S]*$/i, "");

  return html.trim();
}

/**
 * Main scrape
 */
async function scrape() {
  await fs.remove(OUTPUT_DIR);
  await fs.ensureDir(OUTPUT_DIR);

  console.log("🚀 Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const seeds = [BASE, BASE + "/es/", BASE + "/blog", BASE + "/es/blog"];
  const visited = new Set();
  const toVisit = new Set(seeds);
  const items = [];

  while (toVisit.size > 0) {
    let url = [...toVisit][0];
    toVisit.delete(url);

    // Normalize to avoid dupes (remove trailing slash & query params)
    url = url.replace(/\/$/, "").split("?")[0];
    if (visited.has(url)) continue;
    visited.add(url);

    if (!(await safeGoto(page, url))) continue;
    console.log(`🌐 Visiting: ${url}`);

    if (url.endsWith("/blog") || url.endsWith("/es/blog")) {
      console.log("🔄 Scrolling to load all blog posts...");
      await autoScroll(page);
    }

    // Expand FAQs if present
    await expandFAQs(page);

    // Collect links
    const anchors = await page.$$eval("a[href]", (els) =>
      els.map((a) => a.getAttribute("href"))
    );
    for (const href of anchors) {
      if (!href) continue;
      if (href.startsWith("#")) continue;
      let abs = new URL(href, BASE).toString().split("#")[0];
      abs = abs.replace(/\/$/, "").split("?")[0]; // normalize
      if (abs.startsWith(BASE) && !visited.has(abs)) {
        if (abs.includes("/post/") || abs.includes("/es/post/")) {
          toVisit.add(abs);
        } else if (
          abs === BASE ||
          abs === BASE + "/" ||
          abs.startsWith(BASE + "/es") ||
          abs.split("/").length <= 5
        ) {
          toVisit.add(abs);
        }
      }
    }

    if (url.endsWith("/blog") || url.endsWith("/es/blog")) continue;

    // Title
    let title = await page.title();
    if (!title) {
      try {
        title = await page.$eval("h1", (el) => el.textContent.trim());
      } catch {}
    }
    if (!title) {
      console.log("⚠️ Skipping, no title:", url);
      continue;
    }

    // Content extraction
    let bodyHtml = "";
    try {
      const article = await page.$("article");
      if (article) {
        bodyHtml = await article.evaluate((el) => el.innerHTML);
        console.log("📝 Extracted <article>");
      } else {
        const main = await page.$("main");
        if (main) {
          bodyHtml = await main.evaluate((el) => el.innerHTML);
          console.log("📝 Extracted <main>");
        } else {
          const body = await page.$("body");
          bodyHtml = await body.evaluate((el) => el.innerHTML);
          console.log("⚠️ Fallback: full <body>");
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed extracting content, skipping:", e.message);
      continue;
    }

    bodyHtml = cleanContent(bodyHtml);

    if (!bodyHtml || bodyHtml.length < 200) {
      console.log("⚠️ Skipping, too little content:", url);
      continue;
    }

    const slug = slugify(title, { lower: true, strict: true });

    // Dates
    let date = new Date().toISOString();
    try {
      const metaDate = await page.$eval(
        'meta[property="article:published_time"]',
        (el) => el.getAttribute("content")
      );
      if (metaDate) {
        date = new Date(metaDate).toISOString();
        console.log(`🕒 Published: ${date}`);
      }
    } catch {
      try {
        const metaMod = await page.$eval(
          'meta[property="article:modified_time"]',
          (el) => el.getAttribute("content")
        );
        if (metaMod) {
          date = new Date(metaMod).toISOString();
          console.log(`🕒 Modified: ${date}`);
        }
      } catch {
        console.log("⚠️ No date found, using today");
      }
    }

    const postType =
      url.includes("/post/") || url.includes("/es/post/") ? "post" : "page";

    const categories = [];
    if (url.includes("/es/post/")) categories.push("Spanish");

    items.push({ title, slug, url, date, bodyHtml, postType, categories });
    console.log(`✅ Scraped: ${title} → ${postType} (${date})`);
  }

  await browser.close();
  console.log(`📊 Total items scraped: ${items.length}`);

  // Build WXR
  console.log("📝 Building WXR import.xml...");
  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele("rss", {
      version: "2.0",
      "xmlns:excerpt": "http://wordpress.org/export/1.2/excerpt/",
      "xmlns:content": "http://purl.org/rss/1.0/modules/content/",
      "xmlns:wfw": "http://wellformedweb.org/CommentAPI/",
      "xmlns:dc": "http://purl.org/dc/elements/1.1/",
      "xmlns:wp": "http://wordpress.org/export/1.2/",
    })
    .ele("channel");

  root.ele("title").txt("Wix Export Import").up();
  root.ele("link").txt(BASE).up();
  root.ele("description").txt("Migrated content from Wix").up();
  root.ele("wp:wxr_version").txt("1.2").up();
  root.ele("wp:base_site_url").txt(BASE).up();
  root.ele("wp:base_blog_url").txt(BASE).up();

  const author = root.ele("wp:author");
  author.ele("wp:author_id").txt("1").up();
  author.ele("wp:author_login").txt("admin").up();
  author.ele("wp:author_email").txt("admin@example.com").up();
  author.ele("wp:author_display_name").dat("Admin").up();
  author.ele("wp:author_first_name").txt("").up();
  author.ele("wp:author_last_name").txt("").up();
  author.up();

  for (const p of items) {
    const item = root.ele("item");
    item.ele("title").txt(p.title).up();
    item.ele("link").txt(p.url).up();
    item.ele("pubDate").txt(new Date(p.date).toUTCString()).up();
    item.ele("dc:creator").txt("admin").up();
    item.ele("guid", { isPermaLink: "false" }).txt(p.url).up();
    item.ele("description").txt("").up();
    item.ele("content:encoded").dat(p.bodyHtml).up();
    item.ele("excerpt:encoded").dat("").up();

    item.ele("wp:post_id").txt(String(Math.floor(Math.random() * 100000))).up();
    item.ele("wp:post_date").txt(p.date.replace("T", " ").split(".")[0]).up();
    item.ele("wp:post_date_gmt").txt(p.date.replace("T", " ").split(".")[0]).up();
    item.ele("wp:comment_status").txt("closed").up();
    item.ele("wp:ping_status").txt("closed").up();
    item.ele("wp:post_name").txt(p.slug).up();
    item.ele("wp:status").txt("publish").up();
    item.ele("wp:post_parent").txt("0").up();
    item.ele("wp:menu_order").txt("0").up();
    item.ele("wp:post_type").txt(p.postType).up();
    item.ele("wp:post_password").txt("").up();
    item.ele("wp:is_sticky").txt("0").up();

    for (const cat of p.categories) {
      const catEl = item.ele("category", {
        domain: "category",
        nicename: slugify(cat, { lower: true, strict: true }),
      });
      catEl.txt(cat).up();
    }

    item.up();
  }

  const xml = root.end({ prettyPrint: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "import.xml"), xml, "utf8");

  console.log("🎉 Done! File written to ./output/import.xml");
}

scrape();
