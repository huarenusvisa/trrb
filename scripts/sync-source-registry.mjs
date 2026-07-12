import fs from "node:fs/promises";

const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.log("Supabase source-registry sync skipped: secrets not configured.");
  process.exit(0);
}
const registry = JSON.parse(await fs.readFile(new URL("../data/source-registry.json", import.meta.url), "utf8"));
const response = await fetch(`${url}/rest/v1/news_sources?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(registry.map(item => ({ ...item, updated_at: new Date().toISOString() }))),
});
if (!response.ok) throw new Error(`Source registry sync failed ${response.status}: ${await response.text()}`);
console.log(`Source registry synced: ${registry.length} sources.`);
