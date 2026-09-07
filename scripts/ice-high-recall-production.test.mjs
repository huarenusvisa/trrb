import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("生产ICE流水线启用高召回但优先最近内容且成本有上限", () => {
  const workflow = read(".github/workflows/ice-unified-pipeline.yml");
  assert.match(workflow, /scripts\/ice-high-recall-discovery\.mjs/);
  assert.match(workflow, /ICE_HIGH_RECALL_LOOKBACK_HOURS: "6"/);
  assert.match(workflow, /ICE_HIGH_RECALL_MAX_PAGES: "2"/);
  assert.match(workflow, /ICE_HIGH_RECALL_RESULTS_PER_QUERY: "50"/);
  assert.match(workflow, /ICE_HIGH_RECALL_MIN_SCORE: "60"/);
  assert.match(workflow, /ICE_HIGH_RECALL_MIN_FOLLOWERS: "1000"/);
});

test("新闻质量门禁在候选门禁之前执行", () => {
  const workflow = read(".github/workflows/ice-unified-pipeline.yml");
  const qualityIndex = workflow.indexOf("node scripts/ice-news-quality-gate.mjs");
  const candidateIndex = workflow.indexOf("node scripts/ice-candidate-gate.mjs");
  assert.ok(qualityIndex >= 0);
  assert.ok(candidateIndex > qualityIndex);
});

test("高召回评分不能绕过机构语境和具体事件要求", () => {
  const gate = read("scripts/ice-candidate-gate.mjs");
  assert.match(gate, /highRecallSignal/);
  assert.match(gate, /hasAgencyContext/);
  assert.doesNotMatch(gate, /if \(highRecallSignal\(row\)\) return true/);
  assert.match(gate, /ACTION_CONTEXT/);
  assert.match(gate, /non_ice_candidate_filtered/);
});

test("非官方候选仍进入人工审核，最终发布边界保持严格", () => {
  const intake = read("scripts/ice-fast-intake.mjs");
  const publisher = read("scripts/ice-publish-due.mjs");
  assert.match(intake, /status: "pending_corroboration"/);
  assert.match(intake, /human_review_status: "required"/);
  assert.match(publisher, /humanApproved = story\.human_review_status === "approved" && Boolean\(story\.reviewed_by\)/);
  assert.match(publisher, /officialApproved = story\.human_review_status === "not_required_official"/);
  assert.match(publisher, /officialEvidence\(story\.id\)/);
});
