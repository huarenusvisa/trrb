import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCandidate } from "./trump-x-ingest.mjs";

test("特朗普X候选统一进入人工内容池", () => {
  const row = buildCandidate({ id: "123", text: "President Trump announced an update", created_at: "2026-08-28T00:00:00Z", lang: "en" }, { id: "1", username: "reporter", name: "Reporter" });
  assert.equal(row.pipeline, "trump-x-v1");
  assert.equal(row.external_id, "x:trump:123");
  assert.equal(row.proposed_section, "特朗普专题");
  assert.equal(row.decision, "pending_review");
  assert.equal(row.ai_payload.manual_review_required, true);
});

test("特朗普X、中国热门头条和ICE共用三小时控制平面", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/operations-control-plane.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: "27 \*\/3 \* \* \*"/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/trump-x-ingest\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/china-hot-li-teacher-ingest\.yml/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/ice-unified-pipeline\.yml/);
});

test("ICE官方发布不再被旧栏目开关跳过", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/ice-unified-pipeline.yml", import.meta.url), "utf8");
  const publishSection = workflow.slice(workflow.indexOf("- name: Publish"), workflow.indexOf("- name: Write success heartbeat"));
  assert.doesNotMatch(publishSection, /steps\.category\.outputs\.auto_publish/);
  assert.match(publishSection, /ice-trusted-source-promote\.mjs/);
  assert.match(publishSection, /ice-publish-due\.mjs/);
});
