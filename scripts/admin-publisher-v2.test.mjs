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
  assert.match(html, /系统自动生成摘要和关键词/);
  assert.match(html, /<div class="hidden">/);
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

test("missing cover never blocks publication", () => {
  assert.match(api, /A cover is optional/);
  assert.match(api, /storedStatus = requestedStatus/);
  assert.match(api, /background_required: false/);
  assert.doesNotMatch(api, /storedStatus = needsBackgroundCover/);
  assert.match(client, /图片为可选项，无图文章也会正常显示/);
  assert.match(client, /可选AI封面生成失败，不影响文章发布/);
  assert.match(html, /auto-ai-cover" type="checkbox" \/> 无图时尝试生成AI封面（可选，不影响发布）/);
  assert.doesNotMatch(html, /auto-ai-cover" type="checkbox" checked/);
});

test("desktop one-screen mode is scoped only to the publish page", () => {
  assert.match(client, /trrb:admin-page-shown/);
  assert.match(client, /event\.detail\?\.page === "new-article"/);
  assert.match(css, /body\.publisher-mode \.admin-shell/);
  assert.match(css, /body\.publisher-mode \.main/);
  assert.match(css, /body\.publisher-mode \.publisher-page/);
  assert.doesNotMatch(css, /@media[^]*?\n\s*\.main \{\n\s*height: 100vh/);
  assert.match(css, /height: calc\(100vh - 100px\)/);
  assert.match(html, /class="publisher-workspace"/);
});

test("admin loads one base controller before independent feature modules", () => {
  const base = html.indexOf("./admin.js?");
  const publisher = html.indexOf("./admin-publisher-v2.js?");
  const contentCenter = html.indexOf("./content-center.js?");
  const reports = html.indexOf("./ice-report-integrated.js?");
  assert.ok(base >= 0 && publisher > base && contentCenter > publisher && reports > contentCenter);
  assert.doesNotMatch(html, /ice-review-v2\.js/);
});
