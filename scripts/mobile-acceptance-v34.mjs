import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.TRRB_TEST_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

async function waitForMediaCss(page) {
  await page.waitForFunction(() =>
    [...document.styleSheets].some((sheet) => String(sheet.href || "").includes("news-media-v34.css"))
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    html: document.documentElement.scrollWidth
  }));
  assert.ok(metrics.body <= metrics.viewport + 2, `${label}: body horizontal overflow ${JSON.stringify(metrics)}`);
  assert.ok(metrics.html <= metrics.viewport + 2, `${label}: html horizontal overflow ${JSON.stringify(metrics)}`);
}

async function assertRatio(page, selector, label, tolerance = 0.12) {
  const boxes = await page.locator(selector).evaluateAll((nodes) => nodes
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    })
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
    })
  );
  const expected = 16 / 9;
  for (const box of boxes) {
    assert.ok(Math.abs(box.ratio - expected) <= tolerance, `${label}: expected 16:9, received ${JSON.stringify(box)}`);
  }
  return boxes.length;
}

async function testViewport(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173).*/, (route) => route.abort());
  await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
  await waitForMediaCss(page);
  await page.waitForFunction(() => document.querySelector("#hero")?.dataset.focusOnly === "true");

  const heroState = await page.evaluate(() => ({
    count: document.querySelector("#hero")?.dataset.focusCount || "",
    categories: [...document.querySelectorAll("#hero .hero-slide .tag")].map((node) => node.textContent.trim()),
    empty: Boolean(document.querySelector("#hero .hero-focus-empty"))
  }));
  assert.ok(heroState.empty || heroState.categories.length > 0, `Hero did not render a focus state: ${JSON.stringify(heroState)}`);
  assert.ok(heroState.categories.every((category) => category === "重要新闻" || category === "重点新闻"), `Ordinary news entered Hero: ${JSON.stringify(heroState)}`);

  await assertNoHorizontalOverflow(page, `homepage ${viewport.width}px`);
  await assertRatio(page, "#hero", `homepage hero ${viewport.width}px`, 0.04);
  await assertRatio(page, ".top-list img", `homepage top list ${viewport.width}px`, 0.08);
  await assertRatio(page, ".sections-grid .section-lead img", `homepage category images ${viewport.width}px`, 0.08);

  const articleHref = await page.locator('a[href*="article.html?id="]').first().getAttribute("href");
  assert.ok(articleHref, "No article URL was available for mobile article testing");
  await page.goto(new URL(articleHref, `${base}/index.html`).href, { waitUntil: "domcontentloaded" });
  await waitForMediaCss(page);
  await page.waitForSelector(".article-header", { timeout: 15000 });
  await assertNoHorizontalOverflow(page, `article ${viewport.width}px`);
  await assertRatio(page, ".article-image", `article cover ${viewport.width}px`, 0.08);

  await page.goto(`${base}/listing.html?category=${encodeURIComponent("重要新闻")}`, { waitUntil: "domcontentloaded" });
  await waitForMediaCss(page);
  await page.waitForSelector("#listing-grid", { timeout: 15000 });
  await assertNoHorizontalOverflow(page, `listing ${viewport.width}px`);
  await assertRatio(page, ".archive-card img", `listing images ${viewport.width}px`, 0.08);

  await context.close();
}

try {
  await testViewport({ width: 390, height: 844 });
  await testViewport({ width: 430, height: 932 });
  console.log("Mobile browser acceptance passed at 390px and 430px.");
} finally {
  await browser.close();
}
