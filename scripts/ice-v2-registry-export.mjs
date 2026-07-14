#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicy, validatePolicy } from "./ice-v2-source-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "data", "ice-v2-source-registry.generated.json");

function toLegacySource(source) {
  const official = source.class !== "newsroom";
  return {
    topic: "ice",
    username: source.handle,
    name: source.name,
    type: official ? "official" : "major_media",
    tier: official ? 1 : 2,
    group: source.key,
    enabled: Boolean(source.enabled && source.verified),
    requires_corroboration: !official,
    v2_source_class: source.class,
    v2_priority: Number(source.priority || 0),
    v2_topics: source.topics || []
  };
}

export function exportRegistry(policy) {
  const errors = validatePolicy(policy);
  if (errors.length) throw new Error(errors.join("；"));
  return (policy.sources || [])
    .filter((source) => source.enabled && source.verified)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .map(toLegacySource);
}

async function main() {
  const policy = await loadPolicy();
  const registry = exportRegistry(policy);
  await fs.writeFile(OUTPUT, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    output: path.relative(ROOT, OUTPUT),
    sources: registry.length,
    official: registry.filter((item) => item.type === "official").length,
    newsroom: registry.filter((item) => item.type === "major_media").length
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
