#!/usr/bin/env node
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const BUCKET = process.env.ARTICLE_COVER_BUCKET || "article-covers";
const LIMIT = Math.max(1, Math.min(50, Number(process.env.AI_COVER_MAX_PER_RUN || 20)));
const HOT_CATEGORIES = new Set(["热门头条", "中国热门头条"]);
const START_AT = process.env.AI_COVER_START_AT || "2026-08-24T00:00:00Z";

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) throw new Error("缺少 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 或 OPENAI_API_KEY");
}
function headers(extra = {}) { return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra }; }
async function parseResponse(response) {
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}
export function usable(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/(category-placeholders|image-placeholder|tang-ren-daily-placeholder)/i.test(text);
}
export function isHotCategory(value) { return HOT_CATEGORIES.has(String(value || "").trim()); }
function clean(value, max = 1000) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }

async function ensureBucket() {
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`, { headers: headers() });
  if (check.ok) return;
  const created = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 10485760, allowed_mime_types: ["image/png", "image/jpeg", "image/webp"] })
  });
  if (!created.ok && created.status !== 409) throw new Error(`创建封面存储桶失败：${await created.text()}`);
}

async function readCandidates() {
  const select = "id,title,summary,content,category_name,topic_key,cover_image,image_alt,metadata,status,visibility,published_at,created_at";
  const candidates = [];
  const pageSize = 500;
  for (let offset = 0; offset < 10_000 && candidates.length < LIMIT; offset += pageSize) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", select);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("visibility", "eq.public");
    url.searchParams.set("category_name", "in.(热门头条,中国热门头条)");
    url.searchParams.set("published_at", `gte.${START_AT}`);
    url.searchParams.set("order", "published_at.asc.nullslast,created_at.asc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const rows = await parseResponse(await fetch(url, { headers: headers({ Accept: "application/json" }) }));
    const page = Array.isArray(rows) ? rows : [];
    candidates.push(...page.filter((row) => isHotCategory(row.category_name) && !usable(row.cover_image)).slice(0, LIMIT - candidates.length));
    if (page.length < pageSize) break;
  }
  return candidates;
}

export function promptFor(row) {
  const material = `${row.title || ""} ${row.summary || ""}`;
  const topic = row.topic_key === "trump" || /特朗普|川普|Donald Trump/i.test(material)
    ? "Donald Trump related U.S. political news"
    : row.topic_key === "ice" || /ICE|移民执法|遣返|递解/i.test(material)
      ? "U.S. immigration enforcement and ICE news"
      : `${row.category_name || "breaking news"}`;
  return [
    "Create a realistic editorial news photograph for a Chinese-language U.S. news website.",
    "This image is exclusively for the China Hot Headlines section.",
    `News topic: ${topic}.`,
    `Headline context: ${clean(row.title, 220)}.`,
    `Story context: ${clean(row.summary || row.content, 600)}.`,
    "Landscape 16:9 composition, photojournalistic, credible newsroom style, natural lighting, no logos, no watermarks, no text, no captions, no graphic poster design, no fabricated documents, no gore."
  ].join(" ");
}

async function generate(row) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: promptFor(row), size: "1536x1024", quality: "medium", output_format: "webp" })
  });
  const payload = await parseResponse(response);
  const item = payload?.data?.[0] || {};
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) throw new Error(`下载OpenAI图片失败：${imageResponse.status}`);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("OpenAI未返回图片数据");
}

async function upload(row, buffer) {
  const path = `${new Date().toISOString().slice(0, 10)}/${row.id}-${crypto.randomUUID()}.webp`;
  const objectPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${objectPath}`, {
    method: "POST",
    headers: headers({ "Content-Type": "image/webp", "x-upsert": "false" }),
    body: buffer
  });
  if (!response.ok) throw new Error(`上传AI封面失败：${await response.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${path}`;
}

async function save(row, cover) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set("id", `eq.${row.id}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({
      cover_image: cover,
      image_alt: clean(row.image_alt || row.title, 220),
      metadata: {
        ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
        ai_cover_generated: true,
        ai_cover_model: IMAGE_MODEL,
        ai_cover_generated_at: new Date().toISOString(),
      },
    })
  });
  if (!response.ok) throw new Error(`保存AI封面失败：${await response.text()}`);
}

async function main() {
  requireEnv();
  await ensureBucket();
  const candidates = await readCandidates();
  console.log(`发现 ${candidates.length} 条需要AI封面的已发布新闻`);
  let completed = 0;
  for (const row of candidates) {
    try {
      const image = await generate(row);
      const cover = await upload(row, image);
      await save(row, cover);
      completed += 1;
      console.log(`AI封面已生成并保存：${row.title}`);
    } catch (error) {
      console.error(`AI封面生成失败 ${row.id}:`, error.message);
    }
  }
  console.log(`本轮完成 ${completed}/${candidates.length} 张AI封面`);
  if (candidates.length > 0 && completed === 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
