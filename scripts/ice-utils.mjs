import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

export async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, file);
}

export function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBriefTitle(value) {
  let text = normalizeText(value)
    .replace(/[。！？!?]+$/g, "")
    .replace(/美国移民与海关执法局/g, "ICE")
    .replace(/美国国土安全部/g, "DHS");

  if (!text) text = "ICE执法最新动态";

  const clauses = text.split(/[，,:：；;｜|—–-]/).map(v => v.trim()).filter(Boolean);
  const preferred = clauses.find(v => Array.from(v).length >= 8 && Array.from(v).length <= 18);
  if (preferred) text = preferred;

  let chars = Array.from(text);
  if (chars.length > 18) text = chars.slice(0, 18).join("").replace(/[，、：:；;]+$/g, "");
  chars = Array.from(text);
  if (chars.length < 8) text = `${text}相关动态`;
  chars = Array.from(text);
  if (chars.length > 18) text = chars.slice(0, 18).join("").replace(/[，、：:；;]+$/g, "");
  return text;
}

export function normalizeSummary(value, max = 110) {
  const text = normalizeText(value || "ICE相关公开信息已更新。");
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

export function normalizeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw) || /\s/.test(raw)) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.href : "";
  } catch {
    return "";
  }
}

export function firstUsableMedia(media = []) {
  const item = media.find(entry => {
    if (!["photo", "video", "animated_gif"].includes(entry?.type)) return false;
    const url = normalizeImageUrl(entry?.url);
    if (!url) return false;
    const width = Number(entry?.width || 0);
    const height = Number(entry?.height || 0);
    return (!width || !height) || (width >= 300 && height >= 160);
  });
  return item ? normalizeImageUrl(item.url) : "";
}

export function stableCandidateKey(item) {
  return String(item?.x_post_id || item?.id || item?.source_url || item?.url || "").trim();
}

export function dedupeByKey(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = stableCandidateKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function newYorkDateKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function isoNow() {
  return new Date().toISOString();
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
