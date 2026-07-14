import fs from "node:fs";
import path from "node:path";

export const REQUIRED_FILES = [
  "data/ice-v2-source-policy.json",
  "scripts/ice-v2-collect.mjs",
  "scripts/ice-v2-event-cluster.mjs",
  "scripts/ice-v2-editor.mjs",
  "netlify/functions/ice-v2-health.js",
  "netlify/functions/ice-v2-publish-now.js",
  "netlify/functions/ice-review-list-v3.js",
  ".github/workflows/ice-v2-official-collector.yml",
  ".github/workflows/ice-v2-media-collector.yml",
  ".github/workflows/ice-v2-event-cluster.yml",
  ".github/workflows/ice-v2-editor.yml"
];

const BANNED_CLASSES = new Set([
  "individual",
  "blogger",
  "commentator",
  "activist",
  "aggregator",
  "discovered_individual",
  "verified_discovered"
]);

export function inspectPolicy(policy) {
  const sources = Array.isArray(policy?.sources) ? policy.sources : [];
  const enabled = sources.filter((source) => source.enabled && source.verified);
  const banned = enabled.filter((source) => BANNED_CLASSES.has(String(source.class || source.source_type || "").toLowerCase()));
  const official = enabled.filter((source) => ["official_agency", "official_office", "policy_official"].includes(source.class));
  const newsroom = enabled.filter((source) => source.class === "newsroom");
  return {
    enabled: enabled.length,
    official: official.length,
    newsroom: newsroom.length,
    banned: banned.map((source) => source.handle || source.key || "unknown")
  };
}

export function inspectFiles(root = process.cwd()) {
  const missing = REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(root, file)));
  return { required: REQUIRED_FILES.length, missing };
}

export function readinessResult({ policy, root = process.cwd() }) {
  const files = inspectFiles(root);
  const sources = inspectPolicy(policy);
  const errors = [];
  if (files.missing.length) errors.push(`缺少文件：${files.missing.join(", ")}`);
  if (sources.official < 10) errors.push(`官方白名单过少：${sources.official}`);
  if (sources.newsroom < 5) errors.push(`正规媒体白名单过少：${sources.newsroom}`);
  if (sources.banned.length) errors.push(`仍启用禁止信源：${sources.banned.join(", ")}`);
  return { ready: errors.length === 0, files, sources, errors };
}
