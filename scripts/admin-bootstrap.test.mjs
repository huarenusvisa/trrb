import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const controller = read("admin/admin.js");
const publisher = read("admin/admin-publisher-v2.js");
const api = read("netlify/functions/admin-articles.js");
const html = read("admin/index.html");

test("login bootstrap verifies the admin and returns active categories in one protected request", () => {
  assert.match(api, /const actor = await authenticateAdmin\(event\)/);
  assert.match(api, /action === "bootstrap"/);
  assert.match(api, /rest\("categories"/);
  assert.match(api, /is_active: "eq\.true"/);
  assert.match(controller, /fetchAdminBootstrap\(accessToken\)/);
  assert.match(controller, /bootstrap\.admin/);
  assert.match(controller, /bootstrap\.categories/);
});

test("category loading retries, exposes shared rows, and shows an actionable failure", () => {
  assert.match(controller, /attempt < 3/);
  assert.match(controller, /AbortSignal\.timeout\(6000\)/);
  assert.match(controller, /window\.categories = categories/);
  assert.match(controller, /栏目加载失败，请刷新后重试/);
  assert.match(controller, /renderCategoryOptions\(bootstrapCategories\)/);
});

test("publisher refuses to save when no real or virtual category is selected", () => {
  assert.match(publisher, /!selectedOption/);
  assert.match(publisher, /!selectedOption\.dataset\.virtualCategory/);
  assert.match(publisher, /已停止发布以防选错类别/);
});

test("admin cache key is advanced for the bootstrap fix", () => {
  assert.match(html, /admin\.js\?v=20261009-bootstrap-v1/);
});
