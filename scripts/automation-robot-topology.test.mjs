#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(ROOT, ".github", "workflows");
const readWorkflow = (name) => fs.readFileSync(path.join(workflowsDir, name), "utf8");

test("only approved control-plane and fixed cleanup workflows are scheduled", () => {
  const scheduled = fs.readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml"))
    .filter((name) => /^  schedule:/m.test(readWorkflow(name)))
    .sort();
  assert.deepEqual(scheduled, ["ice-rejected-cleanup.yml", "operations-control-plane.yml"]);
});

test("AI cover backfill is manual-only", () => {
  const workflow = readWorkflow("ai-cover-backfill.yml");
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  schedule:/m);
});
