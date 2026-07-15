import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const files = [
  "admin/ice-review-v2.js",
  "netlify/functions/_shared/supabase-admin.js",
  "netlify/functions/_shared/ice-v2-health.js",
  "netlify/functions/_shared/ice-v2-review.js",
  "netlify/functions/_shared/ice-v2-publish.js",
  "netlify/functions/ice-v2-health.js",
  "netlify/functions/ice-review-list-v3.js",
  "netlify/functions/ice-review-v2.js",
  "netlify/functions/ice-v2-publish-now.js",
  "topic/ice/ice-stats-enhanced.js",
  "topic/ice/ice-stats-guard.js"
];

const failures = [];

for (const file of files) {
  try {
    await access(file);
  } catch {
    failures.push(`${file}: missing`);
    continue;
  }

  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    failures.push(`${file}: ${String(result.stderr || result.stdout || "syntax check failed").trim()}`);
  }
}

if (failures.length) {
  console.error("ICE v2 Netlify smoke check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`ICE v2 Netlify smoke check passed (${files.length} files).`);
