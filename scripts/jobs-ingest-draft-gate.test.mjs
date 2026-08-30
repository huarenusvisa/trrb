import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./jobs-daily-ingest.mjs", import.meta.url), "utf8");
const workflow = fs.readFileSync(new URL("../.github/workflows/jobs-daily-ingest.yml", import.meta.url), "utf8");

assert.match(source, /status: "draft",\n\s+published_at: null,/);
assert.match(source, /status_reason: "awaiting_human_review"/);
assert.match(source, /moderation_hold: true/);
assert.match(source, /stage: "validated", normalized_job_listing_id: listingId/);
assert.match(source, /const rawStage = row\.status === "open" \? "published" : "validated"/);
assert.doesNotMatch(source, /repairHeldListing[\s\S]{0,500}status: "open"/);
assert.doesNotMatch(source, /status: "open",\n\s+published_at: NOW_ISO/);
assert.match(workflow, /workflow_call:/);
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /\n\s+push:/);
assert.match(workflow, /queue eligible jobs for human review/);

console.log("jobs ingest draft gate regression: PASS");
