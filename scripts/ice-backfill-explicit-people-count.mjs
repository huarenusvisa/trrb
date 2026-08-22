#!/usr/bin/env node
import process from "node:process";
import peopleCountModule from "../netlify/functions/_shared/ice-people-count.js";

const { buildPeopleCountMetadata, extractPeopleCount } = peopleCountModule;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APPLY_CHANGES = /^(1|true|yes|on)$/i.test(String(process.env.APPLY_CHANGES || ""));
const PAGE_SIZE = 200;
const MAX_ARTICLES = Math.max(1, Math.min(5000, Number(process.env.ICE_PEOPLE_BACKFILL_MAX || 2000)));

function parseMetadata(value) {
  if (value && typeof value === "object") return value;
  try { return typeof value === "string" ? JSON.parse(value) : {}; } catch { return {}; }
}

function positiveCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 && count <= 500 ? count : 0;
}

function headers(prefer = "") {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.message || data?.details || data?.raw || `HTTP ${response.status}`);
  return data;
}

async function fetchArticles(offset) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set("select", "id,title,summary,content,published_at,metadata,arrest_count");
  url.searchParams.set("topic_key", "eq.ice");
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
  url.searchParams.set("limit", String(Math.min(PAGE_SIZE, MAX_ARTICLES - offset)));
  url.searchParams.set("offset", String(offset));
  return request(url, { headers: headers() });
}

async function patchArticle(article, metadata) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set("id", `eq.${article.id}`);
  await request(url, {
    method: "PATCH",
    headers: headers("return=minimal"),
    body: JSON.stringify({ metadata })
  });
}

function runSelfTests() {
  const cases = [
    ["弗吉尼亚亚历山大市首航161人遣返海地航班", 161],
    ["ICE在亚历山大执飞遣返航班，搭载161人前往海地。", 161],
    ["ICE遣返161人。", 161],
    ["ICE拘留2人。", 2],
    ["161 migrants were deported on the flight.", 161],
    ["约有35万海地人曾享有临时保护身份。", 0],
    ["2026年8月22日，邮编22314。", 0],
    ["35人参加反遣返示威。", 0]
  ];
  for (const [text, expected] of cases) {
    const actual = extractPeopleCount(text).value;
    if (actual !== expected) throw new Error(`人数解析测试失败：${text}，期望${expected}，实际${actual}`);
  }
  console.log(`人数解析测试通过：${cases.length}项`);
}

async function main() {
  runSelfTests();
  if (process.argv.includes("--self-test")) return;
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("缺少SUPABASE_URL或SUPABASE_SERVICE_ROLE_KEY");

  let scanned = 0;
  let detected = 0;
  let updated = 0;
  let offset = 0;

  while (offset < MAX_ARTICLES) {
    const rows = await fetchArticles(offset);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const article of rows) {
      scanned += 1;
      const metadata = parseMetadata(article.metadata);
      const existing = [
        metadata.people_count,
        metadata.detained_count,
        metadata.arrested_count,
        metadata.removed_count,
        article.arrest_count
      ].map(positiveCount).find(Boolean);
      if (existing) continue;

      const countMetadata = buildPeopleCountMetadata({
        title: article.title,
        summary: article.summary,
        content: article.content,
        event_type: metadata.event_type || ""
      });
      if (!countMetadata.people_count) continue;
      detected += 1;
      console.log(`${APPLY_CHANGES ? "补写" : "拟补写"}：${article.id} → ${countMetadata.people_count}人（${countMetadata.people_count_type}）`);
      if (!APPLY_CHANGES) continue;

      await patchArticle(article, {
        ...metadata,
        ...countMetadata,
        people_count_backfilled_at: new Date().toISOString()
      });
      updated += 1;
    }
    offset += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`ICE人数补算完成：扫描${scanned}篇，识别${detected}篇，写入${updated}篇，模式=${APPLY_CHANGES ? "apply" : "dry-run"}`);
}

main().catch((error) => {
  console.error("ICE人数补算失败：", error);
  process.exitCode = 1;
});
