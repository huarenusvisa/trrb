import fs from "node:fs/promises";
import { hasSupabaseAutomationConfig, syncSourceRegistry, normalizeSupabaseProjectUrl } from "./supabase-news.mjs";

if (!hasSupabaseAutomationConfig()) {
  console.log("Supabase source-registry sync skipped: secrets not configured.");
  process.exit(0);
}

const registryUrl = new URL("../data/source-registry.json", import.meta.url);
const registry = JSON.parse(await fs.readFile(registryUrl, "utf8"));
if (!Array.isArray(registry) || registry.length === 0) {
  throw new Error("Source registry is empty or invalid.");
}

const result = await syncSourceRegistry(registry);
console.log(`Source registry synced to ${normalizeSupabaseProjectUrl()}: ${result.count || 0} sources.`);
