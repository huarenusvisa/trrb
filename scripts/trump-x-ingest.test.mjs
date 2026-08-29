import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCandidate, isInformational, isOfficialTrumpAccount, similarity, targetLength } from "./trump-x-ingest.mjs";

test("特朗普X候选先进入中文编辑流水线", () => {
  const row = buildCandidate({ id: "123", text: "President Trump announced an update", created_at: "2026-08-28T00:00:00Z", lang: "en" }, { id: "1", username: "reporter", name: "Reporter" });
  assert.equal(row.pipeline, "trump-x-v2-chinese-editor");
  assert.equal(row.external_id, "x:trump:123");
  assert.equal(row.proposed_section, "特朗普专题");
  assert.equal(row.decision, "processing");
  assert.equal(row.ai_payload.translation_required, true);
});

test("字数规则和官方账号发布边界固定", () => {
  assert.deepEqual(targetLength("Trump announced an update."), { min: 300, max: 360, band: "300字" });
  assert.deepEqual(targetLength(`Trump ${"policy ".repeat(60)}`), { min: 500, max: 800, band: "500-800字" });
  assert.equal(isOfficialTrumpAccount("@realDonaldTrump"), true);
  assert.equal(isOfficialTrumpAccount("@random_commenter"), false);
  assert.equal(isInformational("@Luke Trump shill", "@random_commenter"), false);
  assert.equal(isInformational("I am announcing a new policy update today for the country.", "@realDonaldTrump"), true);
});

test("近似稿件查重可识别重复内容", () => {
  assert.ok(similarity("特朗普宣布一项新的行政政策并介绍执行安排", "特朗普宣布新的行政政策，并说明执行安排") > 0.5);
  assert.ok(similarity("特朗普宣布一项新的行政政策", "纽约天气晴朗，游客进入中央公园") < 0.2);
});

test("特朗普X、中国热门头条和ICE各自直接执行三小时采集，控制平面只负责手动统筹", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/operations-control-plane.yml", import.meta.url), "utf8");
  const iceWorkflow = fs.readFileSync(new URL("../.github/workflows/ice-unified-pipeline.yml", import.meta.url), "utf8");
  const trumpWorkflow = fs.readFileSync(new URL("../.github/workflows/trump-x-ingest.yml", import.meta.url), "utf8");
  const chinaWorkflow = fs.readFileSync(new URL("../.github/workflows/china-hot-li-teacher-ingest.yml", import.meta.url), "utf8");
  assert.match(workflow, /uses: \.\/\.github\/workflows\/trump-x-ingest\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/china-hot-li-teacher-ingest\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/ice-unified-pipeline\.yml/);
  assert.doesNotMatch(workflow, /cron: "27 \*\/3 \* \* \*"/);
  for (const source of [iceWorkflow, trumpWorkflow, chinaWorkflow]) assert.match(source, /cron: "27 \*\/3 \* \* \*"/);
  assert.match(iceWorkflow, /push:[\s\S]*paths:[\s\S]*ice-unified-pipeline\.yml/);
  assert.match(trumpWorkflow, /push:[\s\S]*paths:[\s\S]*trump-x-ingest\.yml/);
  assert.doesNotMatch(iceWorkflow, /-\s+["']?scripts\/\*\*/);
  assert.doesNotMatch(trumpWorkflow, /-\s+["']?scripts\/\*\*/);
  assert.match(trumpWorkflow, /TRUMP_X_LOOKBACK_HOURS: "24"/);
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
  assert.match(maintenance, /Reconcile historical article categories/);
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
  assert.match(script, /archived_non_official/);
  assert.match(script, /translated_to_chinese/);
  assert.match(script, /duplicate_check_days: 30/);
  assert.match(script, /minLength: schemaMin/);
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
  assert.match(api, /必须达到\$\{target\.min\}-\$\{target\.max\}字/);
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
  assert.match(publish, /input\.not_old_news_confirmed/);
  assert.match(publish, /input\.image_reviewed/);
  assert.match(list, /hidden_non_ice/);
  assert.match(list, /isIceEnforcementText/);
});
