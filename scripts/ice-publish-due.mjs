#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import peopleCountModule from "../netlify/functions/_shared/ice-people-count.js";
import iceClassifier from "../netlify/functions/_shared/ice-enforcement.js";

const { buildPeopleCountMetadata } = peopleCountModule;
const { isIceEnforcementText } = iceClassifier;
const OFFICIAL_TYPES = /^(official|government|agency)$/i;
const OFFICIAL_HANDLES = /^(icegov|dhsgov|hsi_hq|cbp|usbpchief|uscis|dojcrimdiv|usmarshalshq|fbi|ero[a-z0-9_]*|ice[a-z0-9_]*|dhs[a-z0-9_]*|cbp[a-z0-9_]*|usbp[a-z0-9_]*|uscis[a-z0-9_]*)$/i;
const EDITORIAL_VERSION = "zh-title-body-v6-300-600-800-image";

function intEnv(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}
function nowIso() { return new Date().toISOString(); }
function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}
function safeJson(value, fallback = null) {
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return fallback; }
}
function hasChinese(value) { return /[\u3400-\u9fff]/u.test(String(value || "")); }
function chineseRatio(value) { const text = String(value || "").replace(/\s+/g, ""); return text ? (text.match(/[\u3400-\u9fff]/gu) || []).length / Array.from(text).length : 0; }
function bodyLength(value) { return Array.from(String(value || "").replace(/\s+/g, "")).length; }
function hasVisualMedia(post) { const media = safeJson(post?.media, post?.media || []); return (Array.isArray(media) ? media : []).some((item) => item?.url || item?.preview_image_url); }
function editorialReady(story, post) { const payload = safeJson(story?.ai_payload, story?.ai_payload || {}); const min = Number(payload?.target_min_chars || 300); const max = Number(payload?.target_max_chars || 800); const length = bodyLength(story.content); return payload?.translation_version === EDITORIAL_VERSION && payload?.translated_to_chinese === true && payload?.old_news_checked === true && payload?.appears_old_news !== true && hasChinese(story.title) && hasChinese(story.content) && chineseRatio(story.content) >= 0.45 && length >= min && length <= max && (!hasVisualMedia(post) || payload?.image_grounding_used === true); }
function shingles(value) { const text = String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); const out = new Set(); for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2)); return out; }
function similarity(a, b) { const left = shingles(a), right = shingles(b); if (!left.size || !right.size) return 0; let common = 0; for (const token of left) if (right.has(token)) common += 1; return common / (left.size + right.size - common); }
function isOfficialUrgent(story) {
  const payload = safeJson(story?.ai_payload, story?.ai_payload || {});
  return Boolean(payload?.official_urgent);
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJson(text, { raw: text }) : null;
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.message || body?.detail || text.slice(0, 500)}`);
  return body;
}
function requireEnvironment() {
  const missing = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
function headers(prefer = "") {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
  return requestJson(url, { method, headers: headers(prefer), body: body == null ? undefined : JSON.stringify(body) });
}
function bestVideo(post) {
  const media = safeJson(post?.media, post?.media || []);
  const items = Array.isArray(media) ? media : [];
  for (const item of items) {
    if (!/video|animated_gif/i.test(String(item?.type || ""))) continue;
    const variants = Array.isArray(item?.variants) ? item.variants.filter((variant) => /^https?:/i.test(String(variant?.url || ""))) : [];
    const mp4 = variants.filter((variant) => /video\/mp4/i.test(String(variant?.content_type || "")) || /\.mp4(?:\?|$)/i.test(String(variant?.url || ""))).sort((a, b) => Number(b?.bit_rate || 0) - Number(a?.bit_rate || 0))[0];
    const url = mp4?.url || variants[0]?.url || item?.url || "";
    if (url) return { url, poster: item?.preview_image_url || "" };
  }
  return null;
}
async function dueStories(limit) {
  const query = {
    select: "*",
    status: "eq.approved",
    order: "scheduled_at.asc.nullslast,created_at.asc",
    limit: String(Math.max(100, limit * 3))
  };
  if (!boolEnv("ICE_FORCE_FIRST_PUBLISH", false)) query.scheduled_at = `lte.${nowIso()}`;
  const rows = await sb("ice_stories", { query });
  const stories = (Array.isArray(rows) ? rows : []).filter((story) => {
    const payload = safeJson(story?.ai_payload, story?.ai_payload || {});
    const humanApproved = story.human_review_status === "approved" && Boolean(story.reviewed_by);
    const officialApproved = story.human_review_status === "not_required_official" && payload?.official_direct_publish === true;
    return humanApproved || officialApproved;
  });
  const urgentCap = intEnv("ICE_URGENT_MAX_PER_RUN", 20, 1, 50);
  const urgent = stories.filter(isOfficialUrgent).slice(0, urgentCap);
  const urgentIds = new Set(urgent.map((story) => story.id));
  const normal = stories.filter((story) => !urgentIds.has(story.id)).slice(0, limit);
  return [...urgent, ...normal];
}
async function storyEvidence(storyId) {
  const rows = await sb("ice_story_evidence", { query: { select: "*", story_id: `eq.${storyId}`, order: "created_at.asc", limit: "100" } });
  return Array.isArray(rows) ? rows : [];
}
function officialPost(post) {
  const type = String(post?.source_type || "");
  const username = String(post?.source_username || "").replace(/^@/, "");
  return OFFICIAL_TYPES.test(type) || OFFICIAL_HANDLES.test(username);
}
async function officialEvidence(storyId) {
  const links = await storyEvidence(storyId);
  const ids = links.map((row) => row.post_id).filter(Boolean);
  if (!ids.length) return [];
  const rows = await sb("ice_posts", { query: { select: "id,source_type,source_username", id: `in.(${ids.join(",")})`, limit: "100" } });
  return (Array.isArray(rows) ? rows : []).filter(officialPost);
}
async function leadPost(story) {
  const payload = safeJson(story?.ai_payload, story?.ai_payload || {});
  const preferred = payload?.lead_source_post_id;
  if (preferred) {
    const rows = await sb("ice_posts", { query: { select: "*", x_post_id: `eq.${preferred}`, limit: "1" } });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  const rows = await sb("ice_posts", { query: { select: "*", event_fingerprint: `eq.${story.event_fingerprint}`, order: "trust_tier.asc,source_created_at.asc", limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function existingArticle(postId, eventFingerprint) {
  const bySource = await sb("articles", { query: { select: "id", source_platform: "eq.x", source_post_id: `eq.${postId}`, limit: "1" } });
  if (Array.isArray(bySource) && bySource[0]) return bySource[0];
  const byEvent = await sb("articles", { query: { select: "id", slug: `eq.ice-${eventFingerprint}`, limit: "1" } });
  return Array.isArray(byEvent) ? byEvent[0] || null : null;
}
async function recentSimilarArticle(story) { const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString(); const rows = await sb("articles", { query: { select: "id,title,summary,content", topic_key: "eq.ice", status: "eq.published", published_at: `gte.${cutoff}`, order: "published_at.desc", limit: "1000" } }); const source = `${story.title || ""}${story.summary || ""}${story.content || ""}`; return (Array.isArray(rows) ? rows : []).find((article) => similarity(source, `${article.title || ""}${article.summary || ""}${article.content || ""}`) >= 0.72) || null; }
async function updateStory(id, patch) {
  await sb("ice_stories", { method: "PATCH", query: { id: `eq.${id}` }, body: patch, prefer: "return=minimal" });
}
async function publish(story) {
  const payload = safeJson(story?.ai_payload, story?.ai_payload || {});
  const humanApproved = story.human_review_status === "approved" && Boolean(story.reviewed_by);
  const officialApproved = story.human_review_status === "not_required_official" && payload?.official_direct_publish === true;
  const officialUrgent = isOfficialUrgent(story);

  if (!humanApproved && !officialApproved) {
    await updateStory(story.id, {
      status: "pending_review",
      human_review_status: "required",
      scheduled_at: null,
      decision_reason: `${story.decision_reason || ""}；发布器拦截：必须由后台真实管理员审核批准`
    });
    return null;
  }
  if (!isIceEnforcementText(story.title, story.summary, story.content)) {
    await updateStory(story.id, {
      status: "rejected", human_review_status: "rejected", scheduled_at: null,
      decision_reason: `${story.decision_reason || ""}；ICE分类防火墙：不是明确的ICE执法内容，禁止发布`
    });
    return null;
  }
  if (officialApproved) {
    const verified = await officialEvidence(story.id);
    if (!verified.length || story.conflict_detected || story.privacy_risk || story.fabrication_risk) {
      await updateStory(story.id, {
        status: "pending_review", human_review_status: "required", scheduled_at: null,
        decision_reason: `${story.decision_reason || ""}；发布边界复核未通过，已转人工审核`
      });
      return null;
    }
  }
  const post = await leadPost(story);
  if (!post) throw new Error(`故事${story.id}没有来源帖子`);
  if (!editorialReady(story, post)) {
    await updateStory(story.id, { status: "pending_review", human_review_status: officialApproved ? "required" : story.human_review_status, scheduled_at: null, decision_reason: `${story.decision_reason || ""}；发布器拦截：中文翻译、300/500-800字、读图或旧闻检查未通过` });
    return null;
  }
  const eventType = story.event_type || post.event_type || "other";
  const explicitPeopleMetadata = buildPeopleCountMetadata({
    title: story.title,
    summary: story.summary,
    content: story.content,
    event_type: eventType
  });
  const sourcePeopleCount = Number(post.people_count || 0);
  const peopleMetadata = explicitPeopleMetadata.people_count
    ? explicitPeopleMetadata
    : (sourcePeopleCount > 0 && sourcePeopleCount <= 500
      ? { people_count: sourcePeopleCount, people_count_type: "exact", people_count_source: "structured_source" }
      : {});
  const duplicate = await existingArticle(post.x_post_id, story.event_fingerprint);
  if (duplicate) {
    await updateStory(story.id, { status: "published", article_id: String(duplicate.id), published_at: nowIso(), decision_reason: `${story.decision_reason || ""}；同一来源帖子或事件指纹已发布，未重复创建文章` });
    return duplicate.id;
  }
  const similar = await recentSimilarArticle(story);
  if (similar) {
    await updateStory(story.id, { status: "published", article_id: String(similar.id), published_at: nowIso(), decision_reason: `${story.decision_reason || ""}；与近30天已发布ICE文章高度重复，未重复创建文章` });
    return similar.id;
  }
  const evidence = await storyEvidence(story.id);
  const id = crypto.randomUUID();
  const time = nowIso();
  const video = bestVideo(post);
  const temporaryFeatured = Boolean(video && String(post.source_username || "").toLowerCase() === "ericleeatty");
  const featuredUntil = temporaryFeatured ? new Date(Date.now() + 48 * 3600000).toISOString() : null;
  const rows = await sb("articles", {
    method: "POST",
    body: {
      id, title: story.title, slug: `ice-${story.event_fingerprint}`, summary: story.summary, content: story.content,
      category_name: "ICE执法动态", cover_image: story.cover_image || video?.poster || "", seo_keywords: "ICE,移民执法,拘留,遣返,ERO,HSI,CBP,DHS,美国移民",
      author: "唐人日报编辑部", status: "published", published_at: time, created_at: time, topic_key: "ice", source_platform: "x",
      source_post_id: post.x_post_id, source_url: post.x_url, source_account: post.source_username, source_created_at: post.source_created_at,
      ai_confidence: story.ai_confidence,
      review_status: officialApproved ? "official_source_auto_published" : "human_approved",
      metadata: {
        event_fingerprint: story.event_fingerprint, event_type: eventType, city: post.city || "", state_code: post.state_code || "",
        location_text: post.location_text || [post.city, post.state_code].filter(Boolean).join(", "), ...peopleMetadata, total_score: story.total_score,
        independent_source_count: story.independent_source_count, official_source_count: story.official_source_count, media_source_count: story.media_source_count,
        organization_source_count: story.organization_source_count, decision_reason: story.decision_reason, human_review_status: story.human_review_status,
        reviewed_by: story.reviewed_by || null, reviewed_at: story.reviewed_at || null, editor_notes: story.editor_notes || "", official_urgent: officialUrgent,
        official_source_auto: officialApproved, official_direct_publish: officialApproved, translated_to_chinese: true,
        source_character_count: payload?.source_character_count, target_min_chars: payload?.target_min_chars, target_max_chars: payload?.target_max_chars,
        image_grounding_used: payload?.image_grounding_used === true, image_count: payload?.image_count || 0, image_observations: payload?.image_observations || "",
        duplicate_check_days: 30, old_news_checked: true, distribution_channels: ["ICE执法动态", "ICE实时追踪"],
        video_url: video?.url || "", video_poster: video?.poster || "", video_featured: temporaryFeatured, video_featured_until: featuredUntil,
        confirmed_facts: payload?.confirmed_facts || [], unconfirmed_claims: payload?.unconfirmed_claims || [],
        evidence: evidence.map((item) => ({ post_id: item.x_post_id, url: item.x_url, source_type: item.source_type, independence_key: item.independence_key }))
      }
    },
    prefer: "return=representation"
  });
  const article = Array.isArray(rows) ? rows[0] : rows;
  const finalId = String(article?.id || id);
  await updateStory(story.id, { status: "published", article_id: finalId, published_at: time });
  return finalId;
}
async function main() {
  requireEnvironment();
  const max = intEnv("ICE_PUBLISH_MAX_PER_RUN", 10, 1, 50);
  const stories = await dueStories(max);
  if (!stories.length) { console.log("ICE规律发布器：没有到期内容"); return; }
  let published = 0;
  for (const story of stories) {
    try {
      const id = await publish(story);
      if (id) { published += 1; console.log(`已发布：${story.title} → ${id}${isOfficialUrgent(story) ? "（官方重大突发）" : ""}`); }
    } catch (error) {
      await updateStory(story.id, { status: "failed", decision_reason: `${story.decision_reason || ""}；发布失败：${String(error.message || error).slice(0, 500)}` });
      console.error(`发布${story.id}失败：`, error.message);
    }
  }
  console.log(`ICE规律发布器完成：${published}条`);
}
main().catch((error) => { console.error("ICE规律发布器失败：", error); process.exitCode = 1; });
