# 🛠 Wix → WordPress / Markdown / Images Export Toolkit

This toolkit lets you **migrate content from Wix** into open formats:

- **WordPress WXR importer file** (`import.xml`) → import directly into WordPress  
- **Markdown files** (`.md` with frontmatter) → for static site generators (Hugo, Jekyll, Astro, Next.js, etc.)  
- **Image archive** → all images downloaded and organized by post  

It uses [Playwright](https://playwright.dev/) to handle Wix's heavy JavaScript, infinite scroll, and FAQ dropdowns.

---

## 📦 Requirements

- [Node.js](https://nodejs.org/) v18+  
- npm (comes with Node.js)  
- Playwright browsers (installed automatically)

---

## 📂 Installation

Clone this repo and install dependencies:

```bash
git clone https://github.com/tstanescu1/wix-export-toolkit.git
cd wix-export-toolkit

npm install
npx playwright install
```

---

## 📜 Available Scripts

### 🔹 scrape-wxr.js
Exports all Wix pages & blog posts into a WordPress XML file (WXR).
👉 Import directly in WordPress under Tools → Import → WordPress.

**Usage:**
```bash
node scrape-wxr.js https://your-wix-site.com
```

**Output:**
- `output/import.xml` → WordPress import file

### 🔹 scrape-images.js
Downloads all images per page/post and organizes them by post.

**Usage:**
```bash
node scrape-images.js https://your-wix-site.com
```

**Output:**
- `output/images/{post-slug}/...` → Images organized by post
- `output/images/images.json` → Mapping of post → images

### 🔹 scrape-markdown.js
Exports content as Markdown with YAML frontmatter.

**Usage:**
```bash
node scrape-markdown.js https://your-wix-site.com
```

**Output:**
- `output/markdown/{slug}.md` → Markdown files with frontmatter

**Example output:**
```yaml
---
title: "My Post Title"
slug: "my-post-title"
date: "2024-05-22T17:43:24.031Z"
url: "https://your-wix-site.com/post/my-post"
type: "post"
---
# My Post Title

Cleaned HTML content converted to Markdown
```

---

## 🧹 Cleaning Features

- ✅ Removes headers, navbars, and footers
- ✅ Removes "Recent Posts" blocks  
- ✅ Removes Wix social share sections
- ✅ Removes expand buttons under images
- ✅ Expands FAQ dropdowns so answers are visible
- ✅ Deduplicates pages & posts
- ✅ Converts HTML to clean Markdown (turndown)

---

## 🚀 Example Workflow

### 1. Export everything:
```bash
node scrape-wxr.js https://www.detoxretreatscolombia.com
node scrape-images.js https://www.detoxretreatscolombia.com
node scrape-markdown.js https://www.detoxretreatscolombia.com
```

### 2. Import into WordPress:
1. Go to **Tools → Import → WordPress**
2. Upload `output/import.xml`
3. Select "Download and import file attachments"

### 3. Upload images:
- WordPress will fetch most automatically if URLs are correct
- Or bulk upload `/output/images/` via **Media → Add New** or SFTP

### 4. (Optional) Use Markdown files:
Use the generated markdown files in static site generators like Hugo, Jekyll, Astro, or Next.js.

---

## 📊 Output Structure

```
output/
├── import.xml              # WordPress import file
├── images/                 # Image archive
│   ├── post-slug-1/
│   ├── post-slug-2/
│   └── images.json         # Image mapping
└── markdown/               # Markdown export
    ├── post-1.md
    └── post-2.md
```

---

## ⚙️ Configuration Notes

- **Default WordPress author**: `admin` (edit inside script if needed)
- **Spanish posts**: Auto-tagged as "Spanish"  
- **Date extraction**: Uses `<meta property="article:published_time">`
- **Fallback date**: Today's date if no date found
- **Error handling**: Automatic retries for failed requests

---

## 🛠 Troubleshooting

### Common Issues:

1. **Playwright browser not found**
   ```bash
   npx playwright install
   ```

2. **Site not loading**
   - Check if the URL is accessible
   - Some Wix sites may require specific headers or have anti-bot measures

3. **Images not downloading**
   - Check your internet connection
   - Some images may be behind authentication

4. **Empty content**
   - The site might use dynamic loading that requires more time
   - Try running the script again with a slower connection

---

## 📖 License

MIT — free to use and adapt.