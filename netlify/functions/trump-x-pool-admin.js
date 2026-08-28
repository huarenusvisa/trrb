const crypto = require("node:crypto");
const { authenticateAdmin, rest, safeText } = require("./_shared/supabase-admin");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const chinese = (value) => /[\u3400-\u9fff]/u.test(String(value || ""));
const length = (value) => Array.from(String(value || "").replace(/\s+/g, "")).length;
const sourceText = (value) => safeText(value, 30000).replace(/https?:\/\/\S+/gi, " ").replace(/(?:^|\s)@[A-Za-z0-9_]+/g, " ").replace(/\s+/g, " ").trim();
const targetFor = (row) => sourceText(row.raw_text).length < 300 ? { min: 300, max: 360 } : { min: 500, max: 800 };
const mediaOf = (row) => Array.isArray(row?.raw_payload?.media) ? row.raw_payload.media : [];
const imageOf = (row) => mediaOf(row).find((item) => item?.type === "photo" && item?.url)?.url || mediaOf(row).find((item) => item?.preview_image_url)?.preview_image_url || "";
const parsePayload = (value) => value && typeof value === "object" ? value : {};
function shingles(value) { const text = String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); const set = new Set(); for (let index = 0; index < text.length - 1; index += 1) set.add(text.slice(index, index + 2)); return set; }
function similarity(a, b) { const left = shingles(a), right = shingles(b); if (!left.size || !right.size) return 0; let common = 0; for (const token of left) if (right.has(token)) common += 1; return common / (left.size + right.size - common); }
async function candidate(id) { const rows = await rest("news_candidates", { query: { select: "*", id: `eq.${id}`, pipeline: "like.trump-x-v%", limit: "1" } }); return Array.isArray(rows) ? rows[0] || null : null; }
function editorFields(input) { return { title: safeText(input.title, 220), summary: safeText(input.summary, 1200), content: safeText(input.content, 10000), cover_image: safeText(input.cover_image, 2000) }; }
async function saveCandidate(row, fields, user, status = "edited") {
  const previous = parsePayload(row.ai_payload);
  await rest("news_candidates", { method: "PATCH", query: { id: `eq.${row.id}` }, body: { decision: status === "published" ? "published" : "ready_for_review", decision_reason: status === "published" ? "管理员完成中文编辑并发布" : "管理员已保存中文标题和正文，等待发布", ai_payload: { ...previous, ...fields, status, manually_edited: true, edited_by: user.id, edited_at: new Date().toISOString() }, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
}
async function publish(row, fields, input, user) {
  const target = targetFor(row); const count = length(fields.content); const payload = parsePayload(row.ai_payload);
  if (!chinese(fields.title) || !chinese(fields.content)) throw Object.assign(new Error("标题和正文必须是中文，禁止直接发布英文原文"), { statusCode: 400 });
  if (count < target.min || count > target.max) throw Object.assign(new Error(`正文当前${count}字，必须达到${target.min}-${target.max}字`), { statusCode: 400 });
  if (!input.not_old_news_confirmed || payload.appears_old_news === true) throw Object.assign(new Error("必须核对并确认不是旧闻后才能发布"), { statusCode: 400 });
  if (mediaOf(row).length && !input.image_reviewed) throw Object.assign(new Error("该原帖带有图片，必须查看图片后才能发布"), { statusCode: 400 });
  const exact = await rest("articles", { query: { select: "id", external_id: `eq.${row.external_id}`, limit: "1" } });
  if (Array.isArray(exact) && exact[0]) throw Object.assign(new Error("同一原帖已经发布，已阻止重复发布"), { statusCode: 409 });
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = await rest("articles", { query: { select: "id,title,summary,content", topic_key: "eq.trump", status: "eq.published", published_at: `gte.${cutoff}`, order: "published_at.desc", limit: "1000" } });
  const duplicate = (Array.isArray(recent) ? recent : []).find((article) => similarity(`${fields.title}${fields.summary}${fields.content}`, `${article.title || ""}${article.summary || ""}${article.content || ""}`) >= 0.72);
  if (duplicate) throw Object.assign(new Error(`与近30天已发布文章重复，已阻止发布（${duplicate.id}）`), { statusCode: 409 });
  const id = crypto.randomUUID(); const time = new Date().toISOString(); const postId = safeText(row?.raw_payload?.tweet_id || String(row.external_id || "").split(":").pop(), 100); const cover = fields.cover_image || imageOf(row);
  await rest("articles", { method: "POST", body: { id, title: fields.title, slug: `trump-x-${postId}`, summary: fields.summary || fields.content.slice(0, 160), content: fields.content, category_name: "美国时政", cover_image: cover, image_alt: cover ? fields.title : "", author: "唐人日报编辑部", status: "published", visibility: "public", published_at: time, created_at: time, source_url: row.source_url, source_name: row.source_name, source_account: row.source_account, source_level: row.source_level || "social_monitor", source_platform: "x", source_post_id: postId, source_created_at: row?.raw_payload?.source_created_at || row.collected_at, external_id: row.external_id, topic_key: "trump", primary_section: "美国时政", related_sections: ["美国时政", "特朗普专题"], review_status: "human_approved", automation_source: row.pipeline, seo_title: fields.title, seo_description: fields.summary || fields.content.slice(0, 160), independent_source_count: 1, supporting_sources: [], metadata: { manual_publish: true, translated_to_chinese: true, source_text_original: row.raw_text, source_media: mediaOf(row), source_character_count: sourceText(row.raw_text).length, target_min_chars: target.min, target_max_chars: target.max, body_character_count: count, image_reviewed: Boolean(input.image_reviewed), old_news_checked: true, duplicate_check_days: 30, reviewed_by: user.id, reviewed_at: time } }, prefer: "return=minimal" });
  await saveCandidate(row, fields, user, "published");
  await rest("news_candidates", { method: "PATCH", query: { id: `eq.${row.id}` }, body: { article_id: id }, prefer: "return=minimal" });
  return id;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const { user } = await authenticateAdmin(event);
    const input = event.body ? JSON.parse(event.body) : {};
    const action = safeText(input.action || "list", 40);
    if (action === "list") {
      const rows = await rest("news_candidates", { query: {
        select: "id,external_id,pipeline,source_url,source_account,source_name,raw_text,raw_payload,ai_payload,decision,decision_reason,article_id,collected_at,created_at,updated_at",
        pipeline: "like.trump-x-v%", decision: "in.(processing,pending_review,ready_for_review,review_required,published,failed)", order: "collected_at.desc", limit: "500"
      } });
      return json(200, { ok: true, items: Array.isArray(rows) ? rows : [] });
    }
    const id = safeText(input.id, 100);
    if (!id) return json(400, { error: "缺少内容池记录ID" });
    const row = await candidate(id);
    if (!row) return json(404, { error: "没有找到这条特朗普X资讯" });
    if (action === "save") {
      const fields = editorFields(input);
      if (!fields.title) return json(400, { error: "标题不能为空" });
      await saveCandidate(row, fields, user);
      return json(200, { ok: true });
    }
    if (action === "publish") {
      const fields = editorFields(input);
      const articleId = await publish(row, fields, input, user);
      return json(200, { ok: true, article_id: articleId });
    }
    if (action !== "delete") return json(400, { error: "不支持的操作" });
    await rest("news_candidates", {
      method: "PATCH", query: { id: `eq.${id}`, pipeline: "like.trump-x-v%" },
      body: { decision: "deleted", decision_reason: "管理员从特朗普X资讯内容池删除", updated_at: new Date().toISOString(), ai_payload: { deleted_by: user.id, deleted_at: new Date().toISOString() } },
      prefer: "return=minimal"
    });
    return json(200, { ok: true });
  } catch (error) {
    return json(Number(error.statusCode) || 500, { error: error.message || "特朗普X资讯内容池操作失败" });
  }
};
