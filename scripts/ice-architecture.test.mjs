import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("ICE信源为50至100个且不重复", () => {
  const rows = JSON.parse(
    fs.readFileSync(path.join(root, "data/ice-source-registry.json"), "utf8")
  );
  assert.ok(rows.length >= 50 && rows.length <= 100, `count=${rows.length}`);
  const names = rows.map((row) => row.username.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test("新架构包含多信源、交叉证据和80分门槛", () => {
  const text = fs.readFileSync(
    path.join(root, "scripts/ice-multisource.mjs"),
    "utf8"
  );
  assert.match(text, /source_registry/);
  assert.match(text, /ice_story_evidence/);
  assert.match(text, /independent_source_count/);
  assert.match(text, /ICE_AUTO_PUBLISH_SCORE/);
  assert.match(text, /officialEligible/);
  assert.match(text, /sourceCounts\.independent >= 2/);
  assert.doesNotMatch(text, /data\/ice-live\.json/);
  assert.doesNotMatch(text, /git push/);
});

test("抓取和前端发布已经分离", () => {
  assert.ok(fs.existsSync(path.join(root, "scripts/ice-multisource.mjs")));
  assert.ok(fs.existsSync(path.join(root, "scripts/ice-publish-due.mjs")));
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/ice-auto-publish.yml"),
    "utf8"
  );
  assert.match(workflow, /ice-multisource\.mjs/);
  assert.doesNotMatch(workflow, /git add -A/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
});
