import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const exists = rel => fs.existsSync(path.join(root, rel));

test("architecture is split into fetch, publish, dashboard and pipeline", () => {
  for (const rel of [
    "scripts/ice-fetch.mjs",
    "scripts/ice-publish.mjs",
    "scripts/ice-build-dashboard.mjs",
    "scripts/ice-pipeline.mjs",
    "scripts/ice-utils.mjs"
  ]) assert.equal(exists(rel), true, rel);
  assert.equal(exists("scripts/ice-sync.mjs"), false);
});

test("frontend reads only canonical ICE data", () => {
  const js = read("assets/ice-topic.js");
  assert.match(js, /\/data\/ice-news\.json/);
  assert.match(js, /\/data\/ice-dashboard\.json/);
  assert.match(js, /\/data\/ice-state\.json/);
  assert.doesNotMatch(js, /supabase|ice-live\.json|ice-map\.json|ice-stats\.json/i);
});

test("workflow runs the new pipeline and tests", () => {
  const workflow = read(".github/workflows/ice-auto-publish.yml");
  assert.match(workflow, /node scripts\/ice-pipeline\.mjs/);
  assert.match(workflow, /node --test scripts\/ice-architecture\.test\.mjs/);
  assert.doesNotMatch(workflow, /ice-sync\.mjs|ICE_QUERY:/);
});

test("only canonical ICE JSON files are present", () => {
  for (const rel of [
    "data/ice-candidates.json",
    "data/ice-news.json",
    "data/ice-dashboard.json",
    "data/ice-state.json",
    "data/ice-pending.json"
  ]) assert.equal(exists(rel), true, rel);
  for (const rel of [
    "data/ice-live.json",
    "data/ice-map.json",
    "data/ice-stats.json"
  ]) assert.equal(exists(rel), false, rel);
});
