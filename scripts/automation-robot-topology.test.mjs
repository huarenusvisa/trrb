#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(ROOT, ".github", "workflows");
const readWorkflow = (name) => fs.readFileSync(path.join(workflowsDir, name), "utf8");

test("only the operations master and read-only legacy monitor remain scheduled", () => {
  const scheduled = fs.readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml"))
    .filter((name) => /^  schedule:/m.test(readWorkflow(name)))
    .sort();
  assert.deepEqual(scheduled, ["legacy-404-audit.yml", "operations-control-plane.yml"]);
});

test("legacy 404 monitor runs every six hours in report-only mode", () => {
  const workflow = readWorkflow("legacy-404-audit.yml");
  assert.match(workflow, /cron: "11 \*\/6 \* \* \*"/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  const command = workflow.match(/run: (node scripts\/restore-legacy-archive\.mjs[^\n]*)/)?.[1] || "";
  assert.ok(command, "legacy report command is missing");
  assert.doesNotMatch(command, /--apply/);
  assert.match(workflow, /本任务为 report 模式，不写数据库、不发布文章/);
});

test("AI cover backfill is manual-only", () => {
  const workflow = readWorkflow("ai-cover-backfill.yml");
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  schedule:/m);
});
