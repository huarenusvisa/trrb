#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync("scripts/ai-cover-backfill.mjs", "utf8");
const workflow = fs.readFileSync(".github/workflows/ai-cover-backfill.yml", "utf8");
const control = fs.readFileSync(".github/workflows/operations-control-plane.yml", "utf8");

assert.match(script, /visibility", "eq\.public"/, "candidate query must be public-only");
assert.match(script, /row\?\.status === "published".*row\?\.visibility === "public"/s, "eligibility must require published + public");
assert.match(script, /const PAGE_SIZE = 500/, "candidate scan must paginate beyond the newest 120 rows");
assert.match(script, /while \(candidates\.length < LIMIT\)/, "candidate scan must continue until a batch is filled");
assert.match(script, /ARTICLE_IMAGE_BUCKET \|\| "article-images"/, "backfill must reuse the canonical article-images bucket");
assert.doesNotMatch(script, /method: "POST"[\s\S]{0,200}storage\/v1\/bucket/, "backfill must not create a parallel bucket");
assert.match(script, /Do not depict an identifiable real person/, "prompt must prevent fabricated depictions of real people");
assert.match(script, /do not imply the image is evidence/, "prompt must identify the image as conceptual rather than documentary evidence");
assert.match(script, /Prefer: "return=representation"/, "save must verify the conditional article update");
assert.match(workflow, /workflow_call:/, "cover workflow must be called by the control plane");
assert.match(workflow, /AI_COVER_MAX_PER_RUN: "5"/, "scheduled batch must stay deliberately small");
assert.match(workflow, /ARTICLE_IMAGE_BUCKET: "article-images"/, "workflow must reuse the canonical image bucket");
assert.doesNotMatch(workflow, /schedule:/, "cover workflow must not create an independent scheduler");
assert.match(control, /daily-ai-cover-backfill:/, "control plane must own the scheduled cover queue");
assert.match(control, /uses: \.\/\.github\/workflows\/ai-cover-backfill\.yml/, "control plane must call the existing cover workflow");

console.log("AI cover backfill governance tests passed");
