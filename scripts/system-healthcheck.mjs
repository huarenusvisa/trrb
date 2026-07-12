import { checkSupabaseHealth, normalizeSupabaseProjectUrl } from "./supabase-news.mjs";
const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "X_BEARER_TOKEN", "OPENAI_API_KEY"].filter(k => !process.env[k]);
if (missing.length) throw new Error(`Missing required secrets: ${missing.join(", ")}`);
console.log(`Supabase project: ${normalizeSupabaseProjectUrl()}`);
const health = await checkSupabaseHealth();
console.log(JSON.stringify(health, null, 2));
const bad = Object.entries(health.tables || {}).filter(([k,v]) => !k.endsWith("_error") && v !== true);
if (bad.length) throw new Error(`Supabase healthcheck failed for: ${bad.map(([k])=>k).join(", ")}. Execute supabase-news-engine-v4.sql.`);
