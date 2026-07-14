import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../.github/workflows/ice-v2-pipeline.yml", import.meta.url), "utf8");

test("pipeline keeps modules separated and ordered", () => {
  assert.match(workflow, /collect-official:/);
  assert.match(workflow, /collect-media:/);
  assert.match(workflow, /cluster:/);
  assert.match(workflow, /editor:/);
  assert.match(workflow, /needs:\s*validate/);
  assert.match(workflow, /node scripts\/ice-v2-event-cluster\.mjs/);
  assert.match(workflow, /node scripts\/ice-v2-editor\.mjs/);
});

test("pipeline does not auto publish", () => {
  assert.doesNotMatch(workflow, /ice-v2-publish-now/);
  assert.doesNotMatch(workflow, /publish_now/);
  assert.doesNotMatch(workflow, /ice-publish-due/);
});

test("pipeline requires repository secrets instead of hardcoded credentials", () => {
  assert.match(workflow, /secrets\.X_BEARER_TOKEN/);
  assert.match(workflow, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /secrets\.OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /sb_[A-Za-z0-9_-]{20,}/);
});
