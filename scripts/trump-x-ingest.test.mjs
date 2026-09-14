import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { buildCandidate, generateChineseDraft, isInformational, isOfficialTrumpAccount, processCandidate, similarity, targetLength } from "./trump-x-ingest.mjs";

test("特朗普X候选先进入中文编辑流水线", () => {
  const row = buildCandidate({ id: "123", text: "President Trump announced an update", created_at: "2026-08-28T00:00:00Z", lang: "en" }, { id: "1", username: "reporter", name: "Reporter" });
  assert.equal(row.pipeline, "trump-x-v2-chinese-editor");
  assert.equal(row.external_id, "x:trump:123");
  assert.equal(row.proposed_section, "特朗普专题");
  assert.equal(row.decision, "processing");
  assert.equal(row.ai_payload.translation_required, true);
});

test("取消字数门槛并保留官方账号与非空原帖边界", () => {
  assert.deepEqual(targetLength("Trump announced an update."), { min: null, max: null, band: "不限字数" });
  assert.deepEqual(targetLength(`Trump ${"policy ".repeat(60)}`), { min: null, max: null, band: "不限字数" });
  assert.equal(isInformational("会谈结束", "@realDonaldTrump"), true);
  assert.equal(isInformational("Meeting ended.", "@realDonaldTrump"), true);
  assert.equal(isInformational("   ", "@realDonaldTrump"), false);
  assert.equal(isInformational("https://example.com", "@realDonaldTrump"), false);
  assert.equal(isOfficialTrumpAccount("@realDonaldTrump"), true);
  assert.equal(isOfficialTrumpAccount("@random_commenter"), false);
  assert.equal(isInformational("@Luke Trump shill", "@random_commenter"), false);
  assert.equal(isInformational("I am announcing a new policy update today for the country.", "@realDonaldTrump"), true);
});

test("近似稿件查重可识别重复内容", () => {
  assert.ok(similarity("特朗普宣布一项新的行政政策并介绍执行安排", "特朗普宣布新的行政政策，并说明执行安排") > 0.5);
  assert.ok(similarity("特朗普宣布一项新的行政政策", "纽约天气晴朗，游客进入中央公园") < 0.2);
});

test("特朗普X、中国热门头条和ICE共用小时唤醒并保留各自运行控制", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/operations-control-plane.yml", import.meta.url), "utf8");
  const iceWorkflow = fs.readFileSync(new URL("../.github/workflows/ice-unified-pipeline.yml", import.meta.url), "utf8");
  const trumpWorkflow = fs.readFileSync(new URL("../.github/workflows/trump-x-ingest.yml", import.meta.url), "utf8");
  const chinaWorkflow = fs.readFileSync(new URL("../.github/workflows/china-hot-li-teacher-ingest.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: "7 \* \* \* \*"/);
  for (const [job, flag, module, child] of [
    ["ice", "ice", "ice", "ice-unified-pipeline"],
    ["china-hot-li-teacher", "china_hot", "china-hot", "china-hot-li-teacher-ingest"],
    ["trump-x", "trump_x", "trump-x", "trump-x-ingest"]
  ]) {
    const block = workflow.split(`\n  ${job}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0] || "";
    assert.match(block, /needs: automation-gate/);
    assert.ok(block.includes("needs.automation-gate.outputs.global == 'true'"));
    assert.ok(block.includes(`needs.automation-gate.outputs.${flag} == 'true'`));
    assert.ok(block.includes("github.event_name == 'schedule'"));
    assert.ok(block.includes("github.event_name == 'workflow_dispatch'"));
    assert.ok(block.includes(`inputs.module == 'all' || inputs.module == '${module}'`));
    assert.ok(block.includes(`uses: ./.github/workflows/${child}.yml`));
  }
  for (const source of [iceWorkflow, trumpWorkflow, chinaWorkflow]) {
    assert.match(source, /^  workflow_call:/m);
    assert.doesNotMatch(source, /^  (schedule|push|workflow_dispatch):/m, "采集入口保持在总控制面");
    assert.match(source, /concurrency:\n  group:/);
  }
  assert.match(trumpWorkflow, /COLLECTION_PIPELINE: "trump-x"/);
  assert.match(trumpWorkflow, /COLLECTION_CADENCE_MINUTES: "180"/);
  assert.match(trumpWorkflow, /COLLECTION_FORCE: \$\{\{ github\.event_name != 'schedule' \}\}/);
  assert.match(trumpWorkflow, /if: steps\.due\.outputs\.due == 'true'\n        run: node scripts\/trump-x-ingest\.mjs/);
  assert.match(trumpWorkflow, /COLLECTION_CADENCE_ACTION: "success"/);
  assert.match(trumpWorkflow, /COLLECTION_CADENCE_ACTION: "failure"/);
  assert.match(trumpWorkflow, /collection-cadence-gate\.mjs/);
  const cadence = fs.readFileSync(new URL("./collection-cadence-gate.mjs", import.meta.url), "utf8");
  assert.match(cadence, /last_success_at/);
  assert.match(cadence, /pipeline:collection-cadence:/);
  assert.doesNotMatch(iceWorkflow, /collection-cadence-gate\.mjs/);
  assert.doesNotMatch(chinaWorkflow, /collection-cadence-gate\.mjs/);
  assert.match(iceWorkflow, /steps\.category\.outputs\.enabled == 'true'/);
  assert.match(trumpWorkflow, /TRUMP_X_LOOKBACK_HOURS: "168"/);
});

test("ICE官方发布不再被旧栏目开关跳过", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/ice-unified-pipeline.yml", import.meta.url), "utf8");
  const publishSection = workflow.slice(workflow.indexOf("- name: Publish"), workflow.indexOf("- name: Write success heartbeat"));
  assert.doesNotMatch(publishSection, /steps\.category\.outputs\.auto_publish/);
  assert.match(publishSection, /ice-trusted-source-promote\.mjs/);
  assert.match(publishSection, /ice-publish-due\.mjs/);
});

test("ICE采集发布与全站历史栏目清理分离", () => {
  const production = fs.readFileSync(new URL("../.github/workflows/ice-unified-pipeline.yml", import.meta.url), "utf8");
  const maintenance = fs.readFileSync(new URL("../.github/workflows/ice-night-maintenance.yml", import.meta.url), "utf8");
  const cleanup = fs.readFileSync(new URL("./reclassify-immigration-articles.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(production, /reclassify-immigration-articles/);
  assert.doesNotMatch(maintenance, /reclassify-immigration-articles/, "自动维护不得重分类普通历史文章");
  assert.match(maintenance, /needs\.new-york-maintenance-gate\.outputs\.allowed == 'true'/);
  assert.match(maintenance, /run: node scripts\/ice-night-maintenance\.mjs/);
  assert.match(maintenance, /run: node scripts\/ice-expire-unreviewed\.mjs/);
  assert.match(maintenance, /run: node scripts\/ice-dedupe-v3\.mjs/);
  assert.doesNotMatch(maintenance, /(?:run: |^\s*)node scripts\/(?:ice-publish-due|ice-trusted-source-promote)\.mjs/m, "夜间内部维护不得自动发布新闻");
  assert.match(cleanup, /category_id: target\.id/);
  assert.match(cleanup, /summary\.failed && STRICT/);
});

test("特朗普流水线必须配置自动翻译和读图", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/trump-x-ingest.yml", import.meta.url), "utf8");
  const script = fs.readFileSync(new URL("./trump-x-ingest.mjs", import.meta.url), "utf8");
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(script, /input_image/);
  assert.match(script, /-is:reply/);
  assert.match(script, /from:\$\{OFFICIAL_HANDLE\}/);
  assert.match(script, /official_user_timeline/);
  assert.match(script, /recent_search_fallback/);
  assert.match(script, /timeline_empty_fallback/);
  assert.match(script, /时间线返回0条/);
  assert.match(script, /archived_non_official/);
  assert.match(script, /translated_to_chinese/);
  assert.match(script, /duplicate_check_days: 30/);
});

test("特朗普内容池提供中文标题正文编辑和人工发布窗口", () => {
  const html = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../admin/content-center.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../netlify/functions/trump-x-pool-admin.js", import.meta.url), "utf8");
  assert.match(html, /trump-editor-title/);
  assert.match(html, /trump-editor-content/);
  assert.match(ui, /data-trump-edit/);
  assert.match(api, /action === "save"/);
  assert.match(api, /action === "publish"/);
});

test("ICE人工发布明确确认读图和旧闻，并在手机端直接显示服务端失败原因", () => {
  const html = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");
  const publish = fs.readFileSync(new URL("../netlify/functions/ice-review-v2.js", import.meta.url), "utf8");
  const list = fs.readFileSync(new URL("../netlify/functions/ice-review-list-v3.js", import.meta.url), "utf8");
  assert.match(html, /review-image-reviewed/);
  assert.match(html, /review-not-old/);
  assert.match(ui, /image_reviewed: el\("review-image-reviewed"\)\.checked/);
  assert.match(ui, /not_old_news_confirmed: el\("review-not-old"\)\.checked/);
  assert.match(ui, /window\.alert\(message\)/);
  assert.match(ui, /Promise\.allSettled\(\[loadReviewQueue\(\), loadArticles\(\)\]\)/);
  assert.match(publish, /input\.not_old_news_confirmed/);
  assert.match(publish, /input\.image_reviewed/);
  assert.match(publish, /Promise\.all\(\[\s*existingArticle/);
  assert.match(publish, /Promise\.all\(\[\s*patchStory\(story\.id, storyPatch\)/);
  assert.match(list, /hidden_non_ice/);
  assert.match(list, /isIceEnforcementText/);
});


const require = createRequire(import.meta.url);
const shortDraft = { title: "会谈结束", summary: "特朗普称会谈结束。", content: "特朗普在官方账号表示，会谈已经结束。", seo_keywords: "特朗普", image_observations: "", appears_old_news: false, old_news_reason: "" };
const officialCandidate = { ...buildCandidate({ id: "short-123", text: "Meeting ended." }, { username: "realDonaldTrump" }), id: "candidate-123" };

function fakeSupabaseEnvironment(t) {
  const previous = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = "https://supabase.invalid";
  t.after(() => { if (previous === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous; });
}

test("自动中文编辑接受短讯和长稿，不扩写凑字或截断正文", async (t) => {
  let draft = shortDraft;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const request = JSON.parse(options.body);
    assert.equal(request.text.format.schema.properties.content.minLength, 1);
    assert.equal(request.text.format.schema.properties.content.maxLength, undefined);
    assert.equal(request.text.format.schema.properties.title.minLength, 1);
    assert.doesNotMatch(request.instructions, /420至560|550至750|正文必须为/);
    calls++;
    return new Response(JSON.stringify({ output_text: JSON.stringify(draft) }));
  });
  for (const content of [shortDraft.content, "这是官方声明的完整正文。".repeat(1001)]) {
    draft = { ...shortDraft, content };
    const result = await generateChineseDraft(officialCandidate);
    assert.equal(result.content, content.normalize("NFKC"));
    assert.deepEqual(result.target, { min: null, max: null, band: "不限字数" });
  }
  assert.equal(calls, 2, "正文长度不应触发重写");
});

test("取消长度规则后，空正文和非中文稿仍不能自动发布", async (t) => {
  let draft = { ...shortDraft, content: "   " };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ output_text: JSON.stringify(draft) })));
  await assert.rejects(generateChineseDraft(officialCandidate), /不能为空/);
  draft = { ...shortDraft, content: "The meeting has ended." };
  await assert.rejects(generateChineseDraft(officialCandidate), /中文检查/);
});

test("自动发布短讯保留非官方、空原帖、旧闻和重复稿保护", async (t) => {
  fakeSupabaseEnvironment(t);
  let draft = shortDraft;
  let writes = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url) === "https://api.openai.com/v1/responses") return new Response(JSON.stringify({ output_text: JSON.stringify(draft) }));
    const path = new URL(url).pathname;
    const body = JSON.parse(options.body);
    writes.push({ path, method: options.method, body });
    if (path.endsWith("/articles")) return new Response(JSON.stringify([{ id: "published-short" }]));
    assert.equal(path, "/rest/v1/news_candidates");
    return new Response(null, { status: 204 });
  });
  const cases = [
    { row: officialCandidate, articles: [], expected: "published", published: true },
    { row: { ...officialCandidate, source_account: "@someoneElse" }, articles: [], expected: "rejected" },
    { row: { ...officialCandidate, raw_text: " " }, articles: [], expected: "rejected" },
    { row: officialCandidate, articles: [{ id: "duplicate", ...shortDraft }], expected: "duplicate" },
    { row: officialCandidate, articles: [], expected: "old_news", old: true }
  ];
  for (const item of cases) {
    writes = [];
    draft = { ...shortDraft, appears_old_news: Boolean(item.old), old_news_reason: item.old ? "原帖明确标注回顾去年事件" : "" };
    assert.equal(await processCandidate(item.row, item.articles), item.expected);
    assert.equal(writes.filter((write) => write.path.endsWith("/articles")).length, item.published ? 1 : 0);
    if (item.published) assert.equal(writes[0].body.content, shortDraft.content.normalize("NFKC"));
  }
});

function mockedPoolApi({ authError, row = officialCandidate, exact = [], recent = [] } = {}) {
  const sharedPath = require.resolve("../netlify/functions/_shared/supabase-admin.js");
  const apiPath = require.resolve("../netlify/functions/trump-x-pool-admin.js");
  const originalShared = require.cache[sharedPath];
  const originalApi = require.cache[apiPath];
  const writes = [];
  require.cache[sharedPath] = { id: sharedPath, filename: sharedPath, loaded: true, exports: {
    safeText: (value, max = 20000) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max),
    authenticateAdmin: async () => { if (authError) throw Object.assign(new Error("无后台权限"), { statusCode: 403 }); return { user: { id: "editor" } }; },
    rest: async (table, options = {}) => {
      if (options.method && options.method !== "GET") { writes.push({ table, ...options }); return []; }
      if (table === "news_candidates") return [row];
      assert.equal(table, "articles");
      return options.query.external_id ? exact : recent;
    }
  } };
  delete require.cache[apiPath];
  let handler;
  try { ({ handler } = require(apiPath)); }
  finally {
    if (originalShared) require.cache[sharedPath] = originalShared; else delete require.cache[sharedPath];
    if (originalApi) require.cache[apiPath] = originalApi; else delete require.cache[apiPath];
  }
  return { handler, writes };
}

const publishEvent = (fields = {}) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify({ action: "publish", id: officialCandidate.id, ...shortDraft, not_old_news_confirmed: true, ...fields }) });

test("人工发布不限制短讯和长正文，也不截断内容", async () => {
  for (const content of [shortDraft.content, "完整新闻正文。".repeat(1600)]) {
    const { handler, writes } = mockedPoolApi();
    const response = await handler(publishEvent({ content }));
    assert.equal(response.statusCode, 200, response.body);
    const article = writes.find((write) => write.table === "articles").body;
    assert.equal(article.content, content);
    assert.equal(article.metadata.target_min_chars, null);
    assert.equal(article.metadata.target_max_chars, null);
  }
});

test("人工发布仍要求登录权限、非空中文、图片旧闻确认并阻止重复", async () => {
  for (const item of [
    { api: { authError: true }, fields: {}, status: 403 },
    { fields: { title: " " }, status: 400 },
    { fields: { content: " " }, status: 400 },
    { fields: { content: "English only" }, status: 400 },
    { fields: { not_old_news_confirmed: false }, status: 400 },
    { api: { row: { ...officialCandidate, ai_payload: { appears_old_news: true } } }, fields: {}, status: 400 },
    { api: { row: { ...officialCandidate, raw_payload: { media: [{ type: "photo", url: "https://example.com/photo.jpg" }] } } }, fields: {}, status: 400 },
    { api: { exact: [{ id: "exists" }] }, fields: {}, status: 409 },
    { api: { recent: [{ id: "similar", ...shortDraft }] }, fields: {}, status: 409 }
  ]) {
    const { handler, writes } = mockedPoolApi(item.api);
    const response = await handler(publishEvent(item.fields));
    assert.equal(response.statusCode, item.status, response.body);
    assert.equal(writes.length, 0, "未满足发布条件时不得写入文章或更新候选状态");
  }
});
