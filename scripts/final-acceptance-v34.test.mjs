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

test("admin review loads the integrated report editor without a legacy loader", async () => {
  const html = await read("admin/index.html");
  const controls = await read("admin/ice-report-controls-v2.js");
  assert.match(html, /ice-report-integrated\.js/);
  assert.doesNotMatch(html, /ice-review-v2\.js/);
  assert.match(controls, /trrb:ice-report-detail/);
  assert.doesNotMatch(controls, /window\.fetch\s*=/);
});

test("homepage hero has one live owner and never restores the legacy false-empty card", async () => {
  const compat = await read("homepage-focus-v34.js");
  const live = await read("articles-home-live-fix.js");
  assert.match(compat, /TRRB_HOME_FOCUS_COMPAT_SHIM/);
  assert.doesNotMatch(compat, /window\.renderHome\s*=/);
  assert.match(live, /generalHeroFallback/);
  assert.doesNotMatch(live, /当前暂无重点新闻/);
  assert.match(live, /window\.TRRB_refreshHomepageFocus/);
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
