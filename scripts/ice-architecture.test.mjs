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

test("ICE开关派发后立即采集，不受三小时节奏锁阻挡", () => {
  const workflow = read(".github/workflows/ice-unified-pipeline.yml");
  assert.doesNotMatch(workflow, /collection-cadence-gate/);
  assert.doesNotMatch(workflow, /COLLECTION_CADENCE_MINUTES/);
  assert.doesNotMatch(workflow, /steps\\.due\\.outputs\\.due/);
  assert.match(workflow, /Collect all ICE sources/);
});

test("ICE官方来源直发，非官方来源仍由后台真实管理员审核", () => {
  const collector = read("scripts/ice-multisource.mjs");
  const publisher = read("scripts/ice-publish-due.mjs");
  const trusted = read("scripts/ice-trusted-source-promote.mjs");
  const restore = read("scripts/ice-restore-human-approved.mjs");
  assert.match(collector, /非官方内容即使达到80分/);
  assert.match(collector, /human_review_status/);
  assert.match(collector, /humanReviewStatus = "required"/);
  assert.match(publisher, /humanApproved = story\.human_review_status === "approved" && Boolean\(story\.reviewed_by\)/);
  assert.match(publisher, /officialApproved = story\.human_review_status === "not_required_official"/);
  assert.match(publisher, /officialEvidence\(story\.id\)/);
  assert.match(publisher, /必须由后台真实管理员审核批准/);
  assert.doesNotMatch(publisher, /runOfficialUrgentPromotion/);
  assert.match(trusted, /status: blockedByRisk \? "pending_review" : "approved"/);
  assert.match(trusted, /human_review_status: blockedByRisk \? "required" : "not_required_official"/);
  assert.match(trusted, /official_direct_publish: !blockedByRisk/);
  assert.match(restore, /reviewer_user_id/);
  assert.match(restore, /reviewed_by: approval\.reviewer_user_id/);
});

test("ERO地区官方补抓使用可配置时间窗并支持分页去重", () => {
  const ero = read("scripts/ice-ero-official-discovery.mjs");
  const launcher = read("scripts/ice-enable-first-backfill.mjs");
  syntaxCheck("scripts/ice-ero-official-discovery.mjs");
  syntaxCheck("scripts/ice-enable-first-backfill.mjs");
  assert.match(ero, /const LOOKBACK_HOURS = Number\(process\.env\.ICE_ERO_LOOKBACK_HOURS \|\| 12\)/);
  assert.match(ero, /max_results", "100"/);
  assert.match(ero, /start_time", lookbackStart\(\)/);
  assert.match(ero, /last_seen_id/);
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

test("ICE发布器在发布边界复核官方来源和风险标记", () => {
  const promoter = read("scripts/ice-official-urgent-promote.mjs");
  const publisher = read("scripts/ice-publish-due.mjs");
  syntaxCheck("scripts/ice-official-urgent-promote.mjs");
  syntaxCheck("scripts/ice-publish-due.mjs");
  assert.match(promoter, /dhsgov\|icegov\|ero/);
  assert.match(promoter, /official_urgent: true/);
  assert.match(promoter, /story\.conflict_detected \|\| story\.privacy_risk \|\| story\.fabrication_risk/);
  assert.doesNotMatch(publisher, /runOfficialUrgentPromotion/);
  assert.match(publisher, /review_status: officialApproved \? "official_source_auto_published" : "human_approved"/);
  assert.match(publisher, /发布边界复核未通过，已转人工审核/);
  assert.match(publisher, /category_name: "ICE执法动态"/);
  assert.match(publisher, /topic_key: "ice"/);
  assert.match(publisher, /distribution_channels: \["ICE执法动态", "ICE实时追踪"\]/);
});

test("同一ICE信息按来源帖子和事件指纹双重去重", () => {
  const publisher = read("scripts/ice-publish-due.mjs");
  assert.match(publisher, /existingArticle\(postId, eventFingerprint\)/);
  assert.match(publisher, /source_post_id: `eq\.\$\{postId\}`/);
  assert.match(publisher, /slug: `eq\.ice-\$\{eventFingerprint\}`/);
  assert.match(publisher, /同一来源帖子或事件指纹已发布/);
});

test("trrb.net/admin包含统一采集内容中心", () => {
  const html = read("admin/index.html");
  const js = read("admin/admin.js");
  const css = read("admin/styles.css");
  assert.match(html, /采集内容中心/);
  assert.match(html, /中国热门头条/);
  assert.match(html, /ICE内容/);
  assert.match(html, /data-review-action="approve"/);
  assert.match(html, /data-review-action="publish_now"/);
  assert.match(js, /\/\.netlify\/functions\/ice-review/);
  assert.match(js, /loadReviewQueue/);
  assert.match(css, /\.review-modal/);
});

test("ICE采集中心区分最近一轮结果与72小时存量", () => {
  const api = read("netlify/functions/ice-review-list-v3.js");
  const ui = read("admin/admin.js");
  const explainer = read("admin/ice-status-explainer.js");
  assert.match(api, /run_summary/);
  assert.match(api, /pipeline:parallel-collection-start/);
  assert.match(api, /pipeline:parallel-pipeline/);
  assert.match(api, /"cover_image","created_at"/);
  assert.match(api, /withinRun\(row\.created_at \|\| row\.first_seen_at/);
  assert.match(api, /published: publishedStories\.length/);
  assert.match(ui, /最近一轮：原始抓取/);
  assert.match(ui, /筛选保留/);
  assert.match(ui, /成功发布/);
  assert.match(ui, /近\$\{Number\(reviewPipeline\.freshness_hours \|\| 72\)\}小时存量/);
  assert.doesNotMatch(ui, /待处理 \$\{pending\}　已提取/);
  assert.match(explainer, /最近一轮新增与发布数量/);
});

test("审核API仅在服务端使用service role并验证管理员", () => {
  const router = read("netlify/functions/ice-review.js");
  const list = read("netlify/functions/ice-review-list-v3.js");
  const publish = read("netlify/functions/ice-review-v2.js");
  const actions = read("netlify/functions/ice-review-actions-v4.js");
  const shared = read("netlify/functions/_shared/supabase-admin.js");
  assert.match(router, /ice-review-list-v3/);
  assert.match(router, /ice-review-actions-v4/);
  assert.match(shared, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(shared, /admin_users/);
  assert.match(shared, /auth\/v1\/user/);
  assert.match(list, /authenticateAdmin/);
  assert.match(publish, /authenticateStaff/);
  assert.match(actions, /authenticateStaff/);
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
