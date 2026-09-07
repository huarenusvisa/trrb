import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("生产ICE流水线启用高召回发现且成本有上限", () => {
  const workflow = read(".github/workflows/ice-unified-pipeline.yml");
  assert.match(workflow, /scripts\/ice-high-recall-discovery\.mjs/);
  assert.match(workflow, /ICE_HIGH_RECALL_LOOKBACK_HOURS: "12"/);
  assert.match(workflow, /ICE_HIGH_RECALL_MAX_PAGES: "2"/);
  assert.match(workflow, /ICE_HIGH_RECALL_RESULTS_PER_QUERY: "50"/);
});

test("采集入口使用宽候选门禁而不是严格发布门禁", () => {
  const workflow = read(".github/workflows/ice-unified-pipeline.yml");
  const gate = read("scripts/ice-candidate-gate.mjs");
  assert.match(workflow, /node scripts\/ice-candidate-gate\.mjs/);
  assert.doesNotMatch(workflow, /node scripts\/ice-official-source-only\.mjs/);
  assert.match(gate, /highRecallSignal/);
  assert.match(gate, /verified_discovered/);
  assert.match(gate, /discovered_individual/);
  assert.match(gate, /federal agents/);
  assert.match(gate, /immigration agents/);
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
