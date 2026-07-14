import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const html = read("admin/index.html");
const client = read("admin/admin-publisher-v2.js");
const css = read("admin/admin-publisher-v2.css");
const api = read("netlify/functions/admin-articles.js");
const service = read("netlify/functions/_shared/supabase-admin.js");
const seo = read("netlify/functions/_shared/article-seo.js");
const ai = read("netlify/functions/_shared/article-ai.js");
const background = read("netlify/functions/admin-article-ai-publish-background.js");

test("article writes use a server-side service-role endpoint instead of browser RLS", () => {
  assert.match(client, /\.netlify\/functions\/admin-articles/);
  assert.doesNotMatch(client, /supabaseClient\.from\(["']articles["']\)\.(?:insert|update|upsert)/);
  assert.match(api, /authenticateAdmin\(event\)/);
  assert.match(api, /rest\("articles"/);
  assert.match(service, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(service, /Authorization: `Bearer \$\{SERVICE_KEY\}`/);
});

test("publisher removes manual SEO work and generates summary plus keywords on the server", () => {
  assert.match(api, /const summary = generateSummary\(content, title\)/);
  assert.match(api, /const seoKeywords = generateSeoKeywords\(title, categoryName, content\)/);
  assert.match(api, /seo_automatic: true/);
  assert.match(api, /summary_automatic: true/);
  assert.match(html, /SEO全自动/);
  assert.match(html, /摘要、Meta描述和SEO关键词会在发布时自动生成/);
  assert.match(html, /publisher-compatibility hidden/);
  assert.match(seo, /function generateSeoKeywords/);
});

test("AI title assistant always requests exactly three separately named titles", () => {
  assert.match(html, /id="article-title-suggestions"/);
  assert.match(html, /id="refresh-title-suggestions"/);
  assert.match(client, /AI正在生成3个标题/);
  assert.match(ai, /required: \["title_1", "title_2", "title_3"\]/);
  assert.match(ai, /parsed\?\.title_1/);
  assert.match(ai, /parsed\?\.title_2/);
  assert.match(ai, /parsed\?\.title_3/);
  assert.match(client, /button\.dataset\.titleSuggestion/);
});

test("checked AI cover queues a background task and publishes only after image generation", () => {
  assert.match(api, /needsBackgroundCover/);
  assert.match(api, /storedStatus = needsBackgroundCover \? "draft" : requestedStatus/);
  assert.match(api, /background_required: needsBackgroundCover/);
  assert.match(client, /admin-article-ai-publish-background/);
  assert.match(client, /startBackgroundPublication\(result\.background_article_id\)/);
  assert.match(background, /const coverImage = await generateCover/);
  assert.match(background, /cover_image: coverImage/);
  assert.match(background, /status: "published"/);
  assert.match(background, /ai_cover_processing: false/);
});

test("desktop one-screen mode is scoped only to the publish page", () => {
  assert.match(client, /document\.body\.classList\.toggle\("publisher-mode", page === "new-article"\)/);
  assert.match(css, /body\.publisher-mode \.admin-shell/);
  assert.match(css, /body\.publisher-mode \.main/);
  assert.match(css, /body\.publisher-mode \.publisher-page/);
  assert.doesNotMatch(css, /@media[^]*?\n\s*\.main \{\n\s*height: 100vh/);
  assert.match(css, /height: calc\(100vh - 100px\)/);
  assert.match(html, /class="publisher-workspace"/);
});

test("new scripts load after the base admin script and before ICE overlays", () => {
  const base = html.indexOf("./admin.js?");
  const publisher = html.indexOf("./admin-publisher-v2.js?");
  const ice = html.indexOf("./ice-review-v2.js?");
  assert.ok(base >= 0 && publisher > base && ice > publisher);
});
