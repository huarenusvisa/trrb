#!/usr/bin/env node
import crypto from "node:crypto";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const BUCKET = process.env.ARTICLE_IMAGE_BUCKET || "article-images";
const LIMIT = Math.max(1, Math.min(50, Number(process.env.AI_COVER_MAX_PER_RUN || 50)));
const PAGE_SIZE = 500;

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) throw new Error("缺少 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 或 OPENAI_API_KEY");
}
function headers(extra = {}) { return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra }; }
async function parseResponse(response) {
  const body = await response.text();
  if (!response.ok) throw new Error(body || `HTTP ${response.status}`);
  return body ? JSON.parse(body) : null;
}
function usable(value) {
  const valueText = String(value || "").trim();
  return Boolean(valueText) && !/(category-placeholders|image-placeholder|tang-ren-daily-placeholder)/i.test(valueText);
}
function clean(value, max = 1000) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }
function eligible(row) {
  return row?.status === "published" && row?.visibility === "public" && !usable(row?.cover_image);
}

async function assertBucket() {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`, { headers: headers() });
  if (!response.ok) throw new Error(`现有封面存储桶不可用：${BUCKET} (${response.status})`);
}

async function readCandidates() {
  const select = "id,title,summary,content,category_name,topic_key,cover_image,status,visibility,published_at,created_at";
  const candidates = [];
  let offset = 0;

  while (candidates.length < LIMIT) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", select);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("visibility", "eq.public");
    url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc,id.asc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const rows = await parseResponse(await fetch(url, { headers: headers({ Accept: "application/json" }) }));
    const page = Array.isArray(rows) ? rows : [];
    candidates.push(...page.filter(eligible).slice(0, LIMIT - candidates.length));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return candidates;
}

function promptFor(row) {
  const material = `${row.title || ""} ${row.summary || ""}`;
  const topic = row.topic_key === "trump" || /特朗普|川普|Donald Trump/i.test(material)
    ? "U.S. political news"
    : row.topic_key === "ice" || /ICE|移民执法|遣返|递解/i.test(material)
      ? "U.S. immigration enforcement news"
      : `${row.category_name || "breaking news"}`;
  return [
    "Create a clearly conceptual landscape editorial illustration for a Chinese-language U.S. news website.",
    `News topic: ${topic}.`,
    `Headline context: ${clean(row.title, 220)}.`,
    `Story context: ${clean(row.summary || row.content, 600)}.`,
    "Use symbolic, non-documentary visual storytelling suitable for a 16:9 crop.",
    "Do not depict an identifiable real person and do not imply the image is evidence from the reported event.",
    "No logos, watermarks, words, captions, readable documents, fake official seals, graphic injury, or gore."
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
  const now = new Date();
  const path = `ai-backfill/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${row.id}-${crypto.randomUUID()}.webp`;
  const objectPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${objectPath}`, {
    method: "POST",
    headers: headers({ "Content-Type": "image/webp", "x-upsert": "false", "Cache-Control": "31536000" }),
    body: buffer
  });
  if (!response.ok) throw new Error(`上传AI封面失败：${await response.text()}`);
  return {
    path,
    url: `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${path}`
  };
}

async function removeUploaded(path) {
  const objectPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${objectPath}`, {
    method: "DELETE",
    headers: headers()
  });
  if (!response.ok && response.status !== 404) console.warn(`未能清理本轮孤立封面：${path}`);
}

async function save(row, cover) {
  const currentUrl = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  currentUrl.searchParams.set("select", "id,cover_image,status,visibility");
  currentUrl.searchParams.set("id", `eq.${row.id}`);
  currentUrl.searchParams.set("limit", "1");
  const currentRows = await parseResponse(await fetch(currentUrl, { headers: headers({ Accept: "application/json" }) }));
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!eligible(current)) return false;

  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set("id", `eq.${row.id}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("visibility", "eq.public");
  if (current.cover_image === null) url.searchParams.set("cover_image", "is.null");
  else url.searchParams.set("cover_image", `eq.${current.cover_image}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify({ cover_image: cover })
  });
  const updated = await parseResponse(response);
  return Array.isArray(updated) && updated.length === 1;
}

async function main() {
  requireEnv();
  await assertBucket();
  const candidates = await readCandidates();
  console.log(`发现 ${candidates.length} 条需要AI封面的公开已发布文章（单轮上限 ${LIMIT}）`);
  let completed = 0;
  for (const row of candidates) {
    try {
      const image = await generate(row);
      const uploaded = await upload(row, image);
      if (!await save(row, uploaded.url)) {
        await removeUploaded(uploaded.path);
        console.log(`文章已由其他流程补图或改变公开状态，跳过：${row.id}`);
        continue;
      }
      completed += 1;
      console.log(`AI封面已生成并保存：${row.title}`);
    } catch (error) {
      console.error(`AI封面生成失败 ${row.id}:`, error.message);
    }
  }
  console.log(`本轮完成 ${completed}/${candidates.length} 张AI封面`);
  if (candidates.length > 0 && completed === 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
