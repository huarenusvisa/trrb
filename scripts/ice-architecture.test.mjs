import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const syntaxCheck = (file) => execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });

test("ICE信源为50至100个且不重复", () => {
  const rows = JSON.parse(read("data/ice-source-registry.json"));
  assert.ok(rows.length >= 50 && rows.length <= 100, `count=${rows.length}`);
  const names = rows.map((row) => row.username.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test("成本控制、多信源和80分门槛存在", () => {
  const text = read("scripts/ice-multisource.mjs");
  assert.match(text, /source_registry/);
  assert.match(text, /ice_story_evidence/);
  assert.match(text, /independent_source_count/);
  assert.match(text, /ICE_AUTO_PUBLISH_SCORE/);
  assert.match(text, /ICE_MONTHLY_X_POST_READ_CAP/);
  assert.match(text, /selectQueriesForRun/);
  assert.match(text, /max_results", "10"/);
  assert.doesNotMatch(text, /data\/ice-live\.json/);
  assert.doesNotMatch(text, /git push/);
});

test("非官方内容必须进入人工审核", () => {
  const collector = read("scripts/ice-multisource.mjs");
  const publisher = read("scripts/ice-publish-due.mjs");
  assert.match(collector, /非官方内容即使达到80分/);
  assert.match(collector, /human_review_status/);
  assert.match(collector, /humanReviewStatus = "required"/);
  assert.match(publisher, /humanApproved/);
  assert.match(publisher, /!officialEligible && !humanApproved/);
});

test("ERO地区官方补抓严格限制为过去2小时并支持分页去重", () => {
  const ero = read("scripts/ice-ero-official-discovery.mjs");
  const launcher = read("scripts/ice-enable-first-backfill.mjs");
  syntaxCheck("scripts/ice-ero-official-discovery.mjs");
  syntaxCheck("scripts/ice-enable-first-backfill.mjs");
  assert.match(ero, /const LOOKBACK_HOURS = 2/);
  assert.match(ero, /max_results", "100"/);
  assert.match(ero, /start_time", twoHourStart\(\)/);
  assert.match(ero, /since_id/);
  assert.match(ero, /next_token/);
  assert.match(ero, /MAX_PAGES_PER_QUERY/);
  assert.match(ero, /EROBaltimore/);
  assert.match(ero, /source_type: "official"/);
  assert.match(ero, /resolution=ignore-duplicates/);
  assert.match(ero, /existingIds/);
  assert.match(launcher, /ice-ero-official-discovery\.mjs/);
  assert.match(launcher, /ERO补抓被硬限制为过去2小时/);
  assert.match(launcher, /!String\(row\.query_key \|\| ""\)\.startsWith\("ero-official-2h-"\)/);
});

test("DHS和ICE官方重大突发可绕过法律风险但不能绕过硬风险", () => {
  const promoter = read("scripts/ice-official-urgent-promote.mjs");
  const publisher = read("scripts/ice-publish-due.mjs");
  syntaxCheck("scripts/ice-official-urgent-promote.mjs");
  syntaxCheck("scripts/ice-publish-due.mjs");
  assert.match(promoter, /dhsgov\|icegov\|ero/);
  assert.match(promoter, /official_urgent: true/);
  assert.match(promoter, /legal_risk_bypassed/);
  assert.match(promoter, /story\.conflict_detected \|\| story\.privacy_risk \|\| story\.fabrication_risk/);
  assert.doesNotMatch(promoter, /story\.legal_risk\s*\|\|/);
  assert.match(publisher, /runOfficialUrgentPromotion/);
  assert.match(publisher, /legalBlocked = Boolean\(story\.legal_risk\) && !officialUrgent/);
  assert.match(publisher, /scoreBlocked = Number\(story\.total_score \|\| 0\) < threshold && !officialUrgent/);
  assert.match(publisher, /category_name: "驱逐快报"/);
  assert.match(publisher, /topic_key: "ice"/);
  assert.match(publisher, /distribution_channels: \["驱逐快报", "ICE动态"\]/);
});

test("同一ICE信息按来源帖子和事件指纹双重去重", () => {
  const publisher = read("scripts/ice-publish-due.mjs");
  assert.match(publisher, /existingArticle\(postId, eventFingerprint\)/);
  assert.match(publisher, /source_post_id: `eq\.\$\{postId\}`/);
  assert.match(publisher, /slug: `eq\.ice-\$\{eventFingerprint\}`/);
  assert.match(publisher, /同一来源帖子或事件指纹已发布/);
});

test("trrb.net/admin包含ICE审核中心", () => {
  const html = read("admin/index.html");
  const js = read("admin/admin.js");
  const css = read("admin/styles.css");
  assert.match(html, /ICE人工审核中心/);
  assert.match(html, /data-review-action="approve"/);
  assert.match(html, /data-review-action="publish_now"/);
  assert.match(js, /\/\.netlify\/functions\/ice-review/);
  assert.match(js, /loadReviewQueue/);
  assert.match(css, /\.review-modal/);
});

test("审核API仅在服务端使用service role并验证管理员", () => {
  const fn = read("netlify/functions/ice-review.js");
  assert.match(fn, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(fn, /admin_users/);
  assert.match(fn, /auth\/v1\/user/);
  assert.match(fn, /approvalEligibility/);
  assert.doesNotMatch(read("admin/admin.js"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("SQL包含人工审核字段和审计日志", () => {
  const sql = read("SUPABASE-ICE-MULTISOURCE.sql");
  assert.match(sql, /human_review_status/);
  assert.match(sql, /ice_review_logs/);
  assert.match(sql, /original_ai_title/);
  assert.match(sql, /final_content/);
  assert.match(sql, /revoke all on table public\.ice_review_logs from anon, authenticated/);
});

test("抓取和前端发布已经分离", () => {
  assert.ok(fs.existsSync(path.join(root, "scripts/ice-multisource.mjs")));
  assert.ok(fs.existsSync(path.join(root, "scripts/ice-publish-due.mjs")));
  const workflow = read(".github/workflows/ice-auto-publish.yml");
  assert.match(workflow, /ice-multisource\.mjs/);
  assert.doesNotMatch(workflow, /git add -A/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
});
