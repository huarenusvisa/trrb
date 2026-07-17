#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const LOOKBACK_DAYS = Number(process.env.ICE_PUBLISHED_DEDUPE_DAYS || 30);
const MAX_POSTS = Number(process.env.ICE_CROSS_LANGUAGE_DEDUPE_MAX || 1500);

function text(value, max = 30000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function json(value, fallback = {}) { if (value && typeof value === "object") return value; try { return JSON.parse(String(value || "")); } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function cutoffDays(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
function requireEnv() { const missing = REQUIRED.filter((name) => !process.env[name]); if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`); }
function headers(prefer = "") { return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function readJson(response) { const raw = await response.text(); if (!raw) return null; try { return JSON.parse(raw); } catch { return { raw }; } }
async function request(url, options = {}) { const response = await fetch(url, options); const body = await readJson(response); if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `请求失败（${response.status}）`); return body; }
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) { const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`); for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) }); }

const STATE_MAP = new Map([
  ["alabama","al"],["alaska","ak"],["arizona","az"],["arkansas","ar"],["california","ca"],["colorado","co"],["connecticut","ct"],["delaware","de"],["florida","fl"],["georgia","ga"],["hawaii","hi"],["idaho","id"],["illinois","il"],["indiana","in"],["iowa","ia"],["kansas","ks"],["kentucky","ky"],["louisiana","la"],["maine","me"],["maryland","md"],["massachusetts","ma"],["michigan","mi"],["minnesota","mn"],["mississippi","ms"],["missouri","mo"],["montana","mt"],["nebraska","ne"],["nevada","nv"],["new hampshire","nh"],["new jersey","nj"],["new mexico","nm"],["new york","ny"],["north carolina","nc"],["north dakota","nd"],["ohio","oh"],["oklahoma","ok"],["oregon","or"],["pennsylvania","pa"],["rhode island","ri"],["south carolina","sc"],["south dakota","sd"],["tennessee","tn"],["texas","tx"],["utah","ut"],["vermont","vt"],["virginia","va"],["washington","wa"],["west virginia","wv"],["wisconsin","wi"],["wyoming","wy"],
  ["缅因州","me"],["亚利桑那州","az"],["德州","tx"],["得州","tx"],["纽约州","ny"],["新泽西州","nj"],["加州","ca"],["佛州","fl"],["宾州","pa"],["科州","co"],["乔治亚州","ga"],["伊利诺伊州","il"],["马萨诸塞州","ma"],["密歇根州","mi"],["明尼苏达州","mn"],["华盛顿州","wa"]
]);
const ACTIONS = [
  ["arrest","arrested","apprehend","custody","detain","detained","逮捕","抓捕","被捕","拘留","扣押","带走"],
  ["shoot","shot","shooting","gunfire","枪击","开枪","中枪"],
  ["raid","operation","sweep","突袭","行动","搜查"],
  ["deport","deported","removal","removed","repatriat","遣返","递解","驱逐"],
  ["death","dead","killed","fatal","死亡","身亡","致死"],
  ["charge","charged","indict","sentenc","起诉","指控","判刑"],
  ["release","released","释放","获释"]
];

function normalize(value) { return text(value).toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/@[a-z0-9_]+/gi, " ").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim(); }
function names(value) { const source = text(value, 12000); const found = source.match(/\b[A-Z][a-z]{2,}(?:[-'][A-Z]?[a-z]+)?(?:\s+[A-Z][a-z]{2,}(?:[-'][A-Z]?[a-z]+)?){1,3}\b/g) || []; return new Set(found.map(normalize).filter((x) => !/^(united states|new york|new jersey|white house|homeland security)$/.test(x))); }
function numbers(value) { return new Set((normalize(value).match(/\b\d{1,4}\b/g) || []).filter((n) => Number(n) < 1900 || Number(n) > 2100)); }
function actions(value) { const s = normalize(value); const out = new Set(); ACTIONS.forEach((group, index) => { if (group.some((term) => s.includes(term))) out.add(String(index)); }); return out; }
function states(value, explicit = "") { const s = normalize(`${explicit || ""} ${value}`); const out = new Set(); for (const [name, code] of STATE_MAP) if (s.includes(name)) out.add(code); const code = String(explicit || "").trim().toLowerCase(); if (/^[a-z]{2}$/.test(code)) out.add(code); return out; }
function cities(value, explicit = "") { const out = new Set(); const raw = `${explicit || ""} ${text(value, 12000)}`; for (const match of raw.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}),?\s+(?:[A-Z]{2}|Arizona|Texas|Maine|Colorado|California|Florida|Georgia|Illinois|New York|New Jersey|Pennsylvania)\b/g)) out.add(normalize(match[1])); return out; }
function overlap(a, b) { if (!a.size || !b.size) return 0; let common = 0; for (const item of a) if (b.has(item)) common += 1; return common / Math.min(a.size, b.size); }
function combined(row) { return [row.title,row.summary,row.content,row.source_text,row.location_text,row.city,row.state,row.state_code].filter(Boolean).join(" "); }
function signature(row) { const all = combined(row); return { names: names(all), numbers: numbers(all), actions: actions(all), states: states(all, row.state_code || row.state), cities: cities(all, row.city), fingerprint: text(row.event_fingerprint || json(row.metadata, {})?.event_fingerprint, 200), sourcePostId: text(row.source_post_id || row.x_post_id, 100) }; }
function sameEvent(a, b) {
  if (a.sourcePostId && b.sourcePostId && a.sourcePostId === b.sourcePostId) return true;
  if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint) return true;
  const name = overlap(a.names, b.names), number = overlap(a.numbers, b.numbers), action = overlap(a.actions, b.actions), state = overlap(a.states, b.states), city = overlap(a.cities, b.cities);
  if (name > 0 && action > 0 && (state > 0 || city > 0 || number > 0)) return true;
  if (city > 0 && action > 0 && number > 0) return true;
  if (state > 0 && action > 0 && number >= 0.5 && (a.numbers.size + b.numbers.size) > 0) return true;
  return false;
}
async function mark(post, articleId) { const payload = json(post.extraction_payload, {}); await sb("ice_posts", { method: "PATCH", query: { id: `eq.${post.id}` }, body: { relevant: false, processing_status: "irrelevant", last_error: "cross_language_duplicate_of_published_article", extraction_payload: { ...payload, cross_language_dedupe: true, duplicate_reference_id: articleId, checked_at: nowIso() } }, prefer: "return=minimal" }); }

async function main() {
  requireEnv();
  const [posts, articles] = await Promise.all([
    sb("ice_posts", { query: { select: "id,x_post_id,source_text,source_created_at,created_at,event_fingerprint,event_type,city,state_code,location_text,extraction_payload,processing_status,relevant", processing_status: "in.(collected,processing,extracted,failed)", relevant: "neq.false", order: "source_created_at.desc.nullslast,created_at.desc", limit: String(MAX_POSTS) } }),
    sb("articles", { query: { select: "id,title,summary,content,city,state,event_date,arrest_count,metadata,source_post_id,published_at", topic_key: "eq.ice", status: "eq.published", published_at: `gte.${cutoffDays(LOOKBACK_DAYS)}`, order: "published_at.desc", limit: "2500" } })
  ]);
  const articleRows = Array.isArray(articles) ? articles : [];
  const articleSignatures = articleRows.map((row) => ({ row, sig: signature(row) }));
  let scanned = 0, skipped = 0;
  for (const post of Array.isArray(posts) ? posts : []) {
    scanned += 1;
    const sig = signature(post);
    const match = articleSignatures.find((item) => sameEvent(sig, item.sig));
    if (!match) continue;
    await mark(post, match.row.id);
    skipped += 1;
  }
  console.log(JSON.stringify({ stage: "ice-cross-language-dedupe-v1", scanned, skipped_as_published_duplicates: skipped }, null, 2));
}

main().catch((error) => { console.error("ICE跨语言数据库去重失败：", error); process.exitCode = 1; });
