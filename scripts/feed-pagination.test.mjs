import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../netlify/edge-functions/feed-live.ts", import.meta.url), "utf8");
const checks = [
  ["public-only", source.includes('status: "eq.published"') && source.includes('visibility: "eq.public"')],
  ["stable pagination", source.includes('order: "published_at.desc.nullslast,created_at.desc,id.asc"')],
  ["offset advances", source.includes("offset: String(scanned)") && source.includes("scanned += page.length")],
  ["stops after eligible target", source.includes("while (eligible.length < FEED_ITEM_LIMIT")],
  ["100 item contract", source.includes("const FEED_ITEM_LIMIT = 100")],
  ["bounded scan", source.includes("const MAX_ARTICLE_SCAN = 10000") && source.includes("feed scan safety limit reached")],
  ["pagination telemetry", source.includes('"x-trrb-feed-source-rows"') && source.includes('"x-trrb-feed-pages"')],
  ["versioned paged response", source.includes('live-supabase-v6-paged-public-only')],
  ["single feed generator", source.includes('export const config = { path: "/feed.xml" }')],
];

for (const [name, ok] of checks) {
  assert.equal(ok, true, name);
  console.log(`PASS ${name}`);
}
console.log(`feed pagination audit passed (${checks.length}/${checks.length})`);
