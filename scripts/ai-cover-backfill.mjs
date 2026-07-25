#!/usr/bin/env node
import crypto from "node:crypto";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const BUCKET = process.env.ARTICLE_COVER_BUCKET || "article-covers";
const LIMIT = Math.max(1, Math.min(10, Number(process.env.AI_COVER_MAX_PER_RUN || 4)));

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) throw new Error("缺少 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 或 OPENAI_API_KEY");
}
function headers(extra = {}) { return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra }; }
async function json(response) { const text = await response.text(); if (!response.ok) throw new Error(text || `HTTP ${response.status}`); return text ? JSON.parse(text) : null; }
function usable(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/(category-placeholders|image-placeholder|tang-ren-daily-placeholder)/i.test(text);
}
function clean(value, max = 1000) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }

async function ensureBucket() {
  const check = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`, { headers: headers() });
  if (check.ok) return;
  const created = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST", headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 10485760, allowed_mime_types: ["image/png","image/jpeg","image/webp"] })
  });
  if (!created.ok && created.status !== 409) throw new Error(`创建封面存储桶失败：${await created.text()}`);
}

async function readCandidates() {
  const select = "id,title,summary,content,category_name,topic_key,cover_image,status,published_at,created_at";
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set("select", select);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
  url.searchParams.set("limit", "120");
  const rows = await json(await fetch(url, { headers: headers({ Accept: "application/json" }) }));
  return (Array.isArray(rows) ? rows : []).filter((row) => !usable(row.cover_image)).slice(0, LIMIT);
}

function promptFor(row) {
  const topic = row.topic_key === "trump" || /特朗普|川普|Donald Trump/i.test(`${row.title} ${row.summary}`)
    ? "Donald Trump related U.S. political news"
    : row.topic_key === "ice" || /ICE|移民执法|遣返|递解/i.test(`${row.title} ${row.summary}`)
      ? "U.S. immigration enforcement and ICE news"
      : `${row.category_name || "breaking news"}`;
  return [
    "Create a realistic editorial news photograph for a Chinese-language U.S. news website.",
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
  const payload = await json(response);
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI未返回图片数据");
  return Buffer.from(b64, "base64");
}

async function upload(row, buffer) {
  const path = `${new Date().toISOString().slice(0,10)}/${row.id}-${crypto.randomUUID()}.webp`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
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
    body: JSON.stringify({ cover_image: cover, updated_at: new Date().toISOString(), metadata: { ai_cover_generated: true, ai_cover_model: IMAGE_MODEL } })
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
      console.log(`AI封面已生成：${row.title}`);
    } catch (error) {
      console.error(`AI封面生成失败 ${row.id}:`, error.message);
    }
  }
  console.log(`本轮完成 ${completed}/${candidates.length} 张AI封面`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
