#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

const VERSION = "zh-title-body-v1";
const REQUIRED = ["OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function safeText(value, max = 30000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function nowIso() {
  return new Date().toISOString();
}

function requireEnvironment() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body?.message || body?.details || body?.error?.message || body?.error || body?.raw || `${response.status}`);
  }
  return body;
}

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: headers(prefer),
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

function hasChinese(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

function chineseRatio(value) {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text) return 0;
  const count = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  return count / Array.from(text).length;
}

function needsTranslation(story) {
  const payload = safeJson(story.ai_payload, {});
  if (payload.translation_version === VERSION) return false;
  const content = safeText(story.content || story.summary, 30000);
  return !hasChinese(story.title) || !hasChinese(content) || chineseRatio(content) < 0.45 || Array.from(content).length < 55;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "content", "source_language"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    content: { type: "string" },
    source_language: { type: "string", enum: ["en", "zh", "mixed", "unknown"] }
  }
};

async function translate(story, posts) {
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions: [
        "你是唐人日报ICE新闻翻译编辑。",
        "所有输出必须使用简体中文，ICE、DHS、ERO、HSI等机构缩写及必要的人名英文拼写可以保留。",
        "只根据账号自主发布的原始帖子生成标题和正文；X回复、评论和对话内容已经由系统过滤，不得恢复或引用。",
        "必须准确翻译原帖事实，不补充外部资料，不把观点、指控或单方说法写成已证实事实。",
        "官方账号内容使用“ICE表示”“DHS通报”“ERO称”等归因；媒体内容使用“据该媒体报道”；个人账号内容使用“该账号表示”或“该账号称”。",
        "title为12至28个中文字符，准确概括地点、机构、动作和核心事件，不使用震惊、炸裂、横扫、铁腕等煽动词。",
        "summary为45至90个中文字符，概括核心事实。",
        "content为可直接供工作人员审核的中文正文：信息较少时60至140字，信息完整时140至320字。保留时间、地点、人物、执法动作、伤亡、指控及来源归因。",
        "不得输出完整英文句子，不得添加免责声明、编辑点评、标签或SEO关键词。"
      ].join("\n"),
      input: JSON.stringify({
        current_story: {
          title: story.title || "",
          summary: story.summary || "",
          content: story.content || "",
          event_type: story.event_type || "other"
        },
        sources: posts.slice(0, 12).map((post) => ({
          username: post.source_username || "",
          display_name: post.source_display_name || "",
          source_type: post.source_type || "",
          created_at: post.source_created_at || "",
          text: post.source_text || "",
          location_text: post.location_text || "",
          city: post.city || "",
          state_code: post.state_code || ""
        }))
      }),
      max_output_tokens: 1400,
      text: {
        format: {
          type: "json_schema",
          name: "ice_chinese_title_body",
          strict: true,
          schema: SCHEMA
        }
      }
    })
  });
  const parsed = safeJson(responseText(response), null);
  if (!parsed) throw new Error("OpenAI未返回可解析的中文标题和正文");
  return parsed;
}

async function storiesToTranslate() {
  const rows = await sb("ice_stories", {
    query: {
      select: "*",
      status: "in.(collecting,pending_review,pending_corroboration,approved)",
      order: "updated_at.desc",
      limit: "40"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function postsFor(story) {
  const rows = await sb("ice_posts", {
    query: {
      select: "id,x_post_id,x_url,source_username,source_display_name,source_type,source_created_at,source_text,location_text,city,state_code,processing_status",
      event_fingerprint: `eq.${story.event_fingerprint}`,
      processing_status: "neq.irrelevant",
      order: "trust_tier.asc,source_created_at.asc",
      limit: "20"
    }
  });
  return (Array.isArray(rows) ? rows : []).filter((post) => safeText(post.source_text, 10000));
}

async function patchStory(story, translated, posts) {
  const payload = safeJson(story.ai_payload, {});
  const title = safeText(translated.title, 220);
  const summary = safeText(translated.summary, 1200);
  const content = safeText(translated.content, 30000);
  if (!title || !content || !hasChinese(title) || !hasChinese(content)) {
    throw new Error("中文标题或正文为空");
  }
  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${story.id}` },
    body: {
      title,
      summary: summary || content.slice(0, 180),
      content,
      final_title: title,
      final_summary: summary || content.slice(0, 180),
      final_content: content,
      ai_payload: {
        ...payload,
        translation_version: VERSION,
        translated_at: nowIso(),
        translated_source_count: posts.length,
        source_language: translated.source_language || "unknown"
      },
      updated_at: nowIso()
    },
    prefer: "return=minimal"
  });
}

async function main() {
  requireEnvironment();
  const stories = await storiesToTranslate();
  let translatedCount = 0;
  let skipped = 0;

  for (const story of stories) {
    if (story.reviewed_at || ["editing", "approved", "rejected"].includes(story.human_review_status)) {
      skipped += 1;
      continue;
    }
    if (!needsTranslation(story)) {
      skipped += 1;
      continue;
    }
    const posts = await postsFor(story);
    if (!posts.length) {
      skipped += 1;
      continue;
    }
    try {
      const translated = await translate(story, posts);
      await patchStory(story, translated, posts);
      translatedCount += 1;
      console.log(`已生成中文标题正文：${story.id}｜${safeText(translated.title, 80)}`);
    } catch (error) {
      console.error(`ICE中文翻译失败 ${story.id}:`, error.message || error);
    }
  }

  console.log(JSON.stringify({
    stage: VERSION,
    checked: stories.length,
    translated: translatedCount,
    skipped
  }));
}

export { hasChinese, chineseRatio, needsTranslation };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("ICE中文标题正文处理失败：", error);
    process.exitCode = 1;
  });
}
