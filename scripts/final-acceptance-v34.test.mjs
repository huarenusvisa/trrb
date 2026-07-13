import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ICE user reports are published from the stored original submission", async () => {
  const api = await read("netlify/functions/ice-report-integrated.js");
  assert.match(api, /function originalSubmission\(report\)/);
  assert.match(api, /const content = originalSubmission\(report\)/);
  assert.match(api, /original_submission_locked: true/);
  assert.match(api, /ai_intervention: false/);
  assert.match(api, /original_submission_sha256/);
  assert.match(api, /category_name: "驱逐快报"/);
  assert.doesNotMatch(api, /input\.title\s*\|\|/);
  assert.doesNotMatch(api, /input\.summary\s*\|\|/);
  assert.doesNotMatch(api, /input\.content\s*\|\|/);
});

test("legacy ICE report endpoint cannot bypass the original-text lock", async () => {
  const legacy = await read("netlify/functions/ice-report-review.js");
  assert.match(legacy, /require\("\.\/ice-report-integrated"\)\.handler/);
});

test("admin review clearly shows immutable original submission fields", async () => {
  const lock = await read("admin/ice-report-raw-lock.js");
  const loader = await read("admin/ice-review-v2.js");
  assert.match(lock, /field\.readOnly = true/);
  assert.match(lock, /原文锁定已开启/);
  assert.match(lock, /用户原始现场描述（原样发布，只读）/);
  assert.match(lock, /原文立即发布/);
  assert.match(loader, /ice-report-raw-lock\.js\?v=20260713-v2/);
  assert.match(loader, /用户投稿完全绕过AI/);
});

test("homepage hero accepts only important-news categories", async () => {
  const focus = await read("homepage-focus-v34.js");
  const installer = await read("topic-config.js");
  assert.match(focus, /new Set\(\["重要新闻", "重点新闻"\]\)/);
  assert.match(focus, /\.filter\(isHomepageFocusArticle\)/);
  assert.match(focus, /普通新闻不会进入首页焦点大图/);
  assert.doesNotMatch(focus, /visualArticles/);
  assert.match(installer, /homepage-focus-v34\.js\?v=34\.0/);
});

test("public news images and mobile frames use a consistent 16:9 ratio", async () => {
  const css = await read("news-media-v34.css");
  const common = await read("site-common.js");
  assert.match(css, /\.hero-card,[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.top-list img[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.news-box \.section-lead img[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.article-page \.article-image[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(common, /news-media-v34\.css\?v=34\.0/);
});
