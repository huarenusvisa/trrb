import { removeRepeatedSegments } from "./ice-v2-event-core.mjs";

export function safeText(value, max = 30000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

export function jsonValue(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

export function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text.trim();
    }
  }
  return "";
}

export function needsChineseEdit(story) {
  const payload = jsonValue(story?.ai_payload, {});
  if (!payload.v2_event_engine) return false;
  if (payload.v2_editor_version === "2.0.0") return false;
  if (["editing", "approved", "rejected"].includes(story?.human_review_status)) return false;
  return true;
}

export function sourceAttribution(post = {}) {
  if (post.source_type === "official") return `${post.source_display_name || post.source_username || "官方机构"}表示`;
  return `据${post.source_display_name || post.source_username || "相关媒体"}报道`;
}

export function evidenceInput(posts = []) {
  return posts.slice(0, 12).map((post) => ({
    source: post.source_display_name || post.source_username || "",
    username: post.source_username || "",
    source_type: post.source_type || "",
    created_at: post.source_created_at || "",
    attribution: sourceAttribution(post),
    text: removeRepeatedSegments(post.source_text || "")
  }));
}

export function validateEdited(result) {
  const title = safeText(result?.title, 220);
  const summary = safeText(result?.summary, 1200);
  const content = safeText(result?.content, 30000);
  const errors = [];
  if (!/[\u3400-\u9fff]/u.test(title)) errors.push("标题必须为中文");
  if (!/[\u3400-\u9fff]/u.test(content)) errors.push("正文必须为中文");
  if (Array.from(title).length < 8 || Array.from(title).length > 32) errors.push("标题长度不符合要求");
  if (Array.from(content).length < 60) errors.push("正文过短");
  if (/震惊|炸裂|横扫|铁腕|清场|惊爆/.test(title)) errors.push("标题包含煽动词");
  if (!summary) errors.push("摘要不能为空");
  return { ok: errors.length === 0, errors, title, summary, content };
}
