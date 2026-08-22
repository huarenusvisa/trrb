import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(
  new URL("../.github/workflows/round13-publish-seo-sync.yml", import.meta.url),
  "utf8",
);

assert.match(workflow, /permissions:\s*\n\s*contents:\s*read\b/);
assert.match(workflow, /cron:\s*["']\*\/5 \* \* \* \*["']/);
assert.match(workflow, /node scripts\/generate-sitemaps\.mjs/);
assert.match(workflow, /node scripts\/generate-feed\.mjs/);
assert.match(workflow, /git diff --check/);
assert.doesNotMatch(workflow, /contents:\s*write\b/);
assert.doesNotMatch(workflow, /git\s+(?:commit|push)\b/);
assert.doesNotMatch(workflow, /git\s+add\b/);

console.log("Round13 SEO workflow is automatic and read-only; it cannot commit or push main.");
