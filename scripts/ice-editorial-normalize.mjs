#!/usr/bin/env node
import process from "node:process";

const EDITORIAL_VERSION = "zh-brief-v2";

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

const STATE_ZH = {
  AL: "阿拉巴马州", AK: "阿拉斯加州", AZ: "亚利桑那州", AR: "阿肯色州", CA: "加利福尼亚州",
  CO: "科罗拉多州", CT: "康涅狄格州", DE: "特拉华州", FL: "佛罗里达州", GA: "佐治亚州",
  HI: "夏威夷州", ID: "爱达荷州", IL: "伊利诺伊州", IN: "印第安纳州", IA: "爱荷华州",
  KS: "堪萨斯州", KY: "肯塔基州", LA: "路易斯安那州", ME: "缅因州", MD: "马里兰州",
  MA: "马萨诸塞州", MI: "密歇根州", MN: "明尼苏达州", MS: "密西西比州", MO: "密苏里州",
  MT: "蒙大拿州", NE: "内布拉斯加州", NV: "内华达州", NH: "新罕布什尔州", NJ: "新泽西州",
  NM: "新墨西哥州", NY: "纽约州", NC: "北卡罗来纳州", ND: "北达科他州", OH: "俄亥俄州",
  OK: "俄克拉何马州", OR: "俄勒冈州", PA: "宾夕法尼亚州", RI: "罗得岛州", SC: "南卡罗来纳州",
  SD: "南达科他州", TN: "田纳西州", TX: "得克萨斯州", UT: "犹他州", VT: "佛蒙特州",
  VA: "弗吉尼亚州", WA: "华盛顿州", WV: "西弗吉尼亚州", WI: "威斯康星州", WY: "怀俄明州",
  DC: "华盛顿特区"
};

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
        "bulletin写成30至50个中文字符的客观快讯；必须以地点开头，不得少于30字，不得超过50字。",
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

function sourceLanguageFromPosts(posts) {
  const text = posts.map((post) => safeText(post.source_text, 5000)).join(" ");
  const hasChinese = /[\u3400-\u9fff]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasChinese && hasLatin) return "mixed";
  if (hasChinese) return "zh";
  if (hasLatin) return "en";
  return "unknown";
}

function savedLocationFromTitle(title) {
  const text = compact(title);
  const index = text.toUpperCase().indexOf("ICE");
  if (index <= 0) return "";
  return text.slice(0, index).replace(/(?:发生|出现|曝出|传出|涉及|展开|启动|执行)$/u, "").slice(0, 40);
}

function locationFromPosts(story, posts) {
  const saved = savedLocationFromTitle(story.final_title || story.title);
  if (saved) return saved;
  const post = posts.find((item) => item.location_text || item.city || item.state_code) || {};
  const stateCode = safeText(post.state_code, 2).toUpperCase();
  const state = STATE_ZH[stateCode] || stateCode;
  const city = safeText(post.city, 80);
  const raw = safeText(post.location_text, 160);
  if (state && city) return `${state}·${city}`;
  return raw || state || city || "地点待确认";
}

function hasSavedChineseEditorial(story) {
  const title = safeText(story.final_title, 220);
  const bulletin = compact(story.final_summary || story.final_content);
  return /[\u3400-\u9fff]/.test(title) && /[\u3400-\u9fff]/.test(bulletin) && Array.from(bulletin).length >= 30 && Array.from(bulletin).length <= 50;
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
      limit: String(intEnv("ICE_NORMALIZE_MAX_STORIES", 30, 1, 50))
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

async function patchStory(story, normalized, posts = []) {
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
    chinese_bulletin_length: Array.from(bulletin).length,
    editorial_evidence_count: posts.length
  };

  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${story.id}` },
    body: {
      title,
      summary: bulletin,
      content: bulletin,
      final_title: title,
      final_summary: bulletin,
      final_content: bulletin,
      ai_payload: payload,
      updated_at: nowIso()
    },
    prefer: "return=minimal"
  });
  console.log(`已生成中文快讯：${locationText}｜${title}｜${Array.from(bulletin).length}字`);
}

async function restoreSavedEditorial(story, posts) {
  const normalized = {
    title: story.final_title,
    bulletin: story.final_summary || story.final_content,
    location_text: locationFromPosts(story, posts),
    city: safeText(posts.find((item) => item.city)?.city, 120),
    state_code: safeText(posts.find((item) => item.state_code)?.state_code, 2),
    source_language: sourceLanguageFromPosts(posts)
  };
  await patchStory(story, normalized, posts);
  console.log(`复用已生成中文快讯：${story.id}`);
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
      if (hasSavedChineseEditorial(story)) {
        await restoreSavedEditorial(story, posts);
      } else {
        const normalized = await normalizeWithAi(story, posts);
        await patchStory(story, normalized, posts);
      }
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
