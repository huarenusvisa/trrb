#!/usr/bin/env node
import process from "node:process";

const EDITORIAL_VERSION = "zh-brief-v1";

function safeJson(value, fallback = null) {
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return fallback; }
}

function safeText(value, max = 20000) {
  return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max);
}

function intEnv(name, fallback, min = 1, max = 100) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function requireEnvironment() {
  const missing = ["OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJson(text, { raw: text }) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.message || body?.error?.message || body?.raw || text.slice(0, 500)}`);
  }
  return body;
}

function sbHeaders(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return requestJson(url, {
    method,
    headers: sbHeaders(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text.trim();
    }
  }
  return "";
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "bulletin", "location_text", "city", "state_code", "source_language"],
  properties: {
    title: { type: "string" },
    bulletin: { type: "string" },
    location_text: { type: "string" },
    city: { type: "string" },
    state_code: { type: "string" },
    source_language: { type: "string", enum: ["zh", "en", "mixed", "unknown"] }
  }
};

async function normalizeWithAi(story, posts) {
  const response = await requestJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions: [
        "你是唐人日报ICE快讯编辑。",
        "所有输出必须是简体中文；原始信源为英文时必须准确翻译，不得保留完整英文句子，ICE、DHS等机构缩写可保留。",
        "只使用信源中明确出现的事实，不补充外部信息，不把指控写成定论。",
        "title写成10至24个中文字符，包含地点和ICE核心动作。",
        "bulletin写成30至50个中文字符的客观快讯；不得少于30字，不得超过50字。",
        "location_text必须进行地点分类，优先格式为“州中文名·城市中文名”，例如“缅因州·比德福德”；无法确认时写“地点待确认”。",
        "city使用中文城市名；state_code使用美国州两位英文缩写，无法确认则留空。",
        "source_language按主要原始信源判断为zh、en、mixed或unknown。",
        "禁止使用震惊、炸裂、横扫、清场、铁腕等煽动词。"
      ].join("\n"),
      input: JSON.stringify({
        current_story: {
          title: story.title || "",
          summary: story.summary || "",
          content: story.content || "",
          event_type: story.event_type || "other"
        },
        sources: posts.slice(0, 12).map((post) => ({
          source: post.source_display_name || post.source_username || "未知来源",
          source_type: post.source_type || "",
          created_at: post.source_created_at || "",
          text: post.source_text || "",
          extracted_location: post.location_text || "",
          city: post.city || "",
          state_code: post.state_code || "",
          claims: post.claims || []
        }))
      }),
      max_output_tokens: 800,
      text: {
        format: {
          type: "json_schema",
          name: "ice_chinese_brief",
          strict: true,
          schema: SCHEMA
        }
      }
    })
  });

  const parsed = safeJson(responseText(response));
  if (!parsed) throw new Error("OpenAI未返回可解析的中文快讯");
  return parsed;
}

function compact(value) {
  return safeText(value, 500)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, "")
    .replace(/[“”]/g, "")
    .trim();
}

function clampBulletin(value) {
  let chars = Array.from(compact(value));
  if (chars.length < 30) {
    const suffix = Array.from("目前公开信息有限，事件地点、人员情况及执法细节仍待有关方面进一步核实。");
    for (const char of suffix) {
      if (chars.length >= 30 || chars.length >= 50) break;
      chars.push(char);
    }
  }
  if (chars.length > 50) chars = chars.slice(0, 49).concat("。");
  const text = chars.join("").replace(/。+$/g, "。");
  return text || "该ICE相关事件地点和具体情况仍待有关方面进一步核实。";
}

function clampTitle(value, location) {
  let text = compact(value).replace(/[。！？!?]+$/g, "");
  if (!text || !/[\u3400-\u9fff]/.test(text)) text = `${location || "地点待确认"}发生ICE执法事件`;
  const chars = Array.from(text);
  return chars.length > 24 ? chars.slice(0, 24).join("") : text;
}

function looksNormalized(story) {
  const payload = story.ai_payload || {};
  const bulletinLength = Array.from(compact(story.summary || story.content)).length;
  const hasChinese = /[\u3400-\u9fff]/.test(`${story.title || ""}${story.summary || ""}`);
  return payload.editorial_version === EDITORIAL_VERSION && hasChinese && bulletinLength >= 30 && bulletinLength <= 50 && payload.location_text;
}

async function storiesToNormalize() {
  const rows = await sb("ice_stories", {
    query: {
      select: "*",
      status: "in.(pending_review,pending_corroboration,approved)",
      order: "updated_at.desc",
      limit: String(intEnv("ICE_NORMALIZE_MAX_STORIES", 16, 1, 50))
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function postsFor(story) {
  const rows = await sb("ice_posts", {
    query: {
      select: "id,x_post_id,x_url,source_username,source_display_name,source_type,source_created_at,source_text,location_text,city,state_code,claims",
      event_fingerprint: `eq.${story.event_fingerprint}`,
      order: "trust_tier.asc,source_created_at.asc",
      limit: "20"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function patchStory(story, normalized) {
  const locationText = safeText(normalized.location_text, 160) || "地点待确认";
  const bulletin = clampBulletin(normalized.bulletin);
  const title = clampTitle(normalized.title, locationText);
  const payload = {
    ...(story.ai_payload || {}),
    location_text: locationText,
    city: safeText(normalized.city, 120),
    state_code: safeText(normalized.state_code, 2).toUpperCase(),
    source_language: normalized.source_language || "unknown",
    editorial_version: EDITORIAL_VERSION,
    editorial_normalized_at: nowIso(),
    chinese_bulletin_length: Array.from(bulletin).length
  };

  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${story.id}` },
    body: {
      title,
      summary: bulletin,
      content: bulletin,
      ai_payload: payload,
      updated_at: nowIso()
    },
    prefer: "return=minimal"
  });
  console.log(`已生成中文快讯：${locationText}｜${title}｜${Array.from(bulletin).length}字`);
}

async function main() {
  requireEnvironment();
  const stories = await storiesToNormalize();
  let changed = 0;

  for (const story of stories) {
    if (looksNormalized(story)) continue;
    if (story.reviewed_at || ["editing", "approved", "rejected"].includes(story.human_review_status)) continue;

    const posts = await postsFor(story);
    if (!posts.length) continue;

    try {
      const normalized = await normalizeWithAi(story, posts);
      await patchStory(story, normalized);
      changed += 1;
    } catch (error) {
      console.error(`中文快讯处理失败 ${story.id}:`, error.message || error);
    }
  }

  console.log(`ICE中文快讯规范化完成：更新${changed}条，共检查${stories.length}条`);
}

main().catch((error) => {
  console.error("ICE中文快讯规范化失败：", error);
  process.exitCode = 1;
});
