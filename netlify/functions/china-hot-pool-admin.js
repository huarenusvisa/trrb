const { authenticateAdmin, rest, safeText } = require("./_shared/supabase-admin");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

async function articleFor(id) {
  if (!id) return null;
  const rows = await rest("articles", { query: { select: "id,status,visibility,metadata", id: `eq.${id}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  try {
    const { user } = await authenticateAdmin(event);
    const input = event.body ? JSON.parse(event.body) : {};
    const action = safeText(input.action || event.queryStringParameters?.action || "list", 40);
    if (action === "list") {
      const rows = await rest("news_candidates", { query: { select: "id,external_id,pipeline,raw_text,raw_payload,ai_payload,decision,decision_reason,article_id,collected_at,processed_at,created_at,updated_at", pipeline: "like.china-hot-li-teacher%", order: "collected_at.desc", limit: "500" } });
      return json(200, { ok: true, items: Array.isArray(rows) ? rows : [] });
    }
    const candidateId = safeText(input.id, 100);
    if (!candidateId) return json(400, { error: "缺少内容池记录ID" });
    const candidates = await rest("news_candidates", { query: { select: "*", id: `eq.${candidateId}`, pipeline: "like.china-hot-li-teacher%", limit: "1" } });
    const candidate = Array.isArray(candidates) ? candidates[0] : null;
    if (!candidate) return json(404, { error: "内容池记录不存在" });
    const article = await articleFor(candidate.article_id);
    const time = new Date().toISOString();
    if (["take_down", "restore"].includes(action)) {
      if (!article) return json(409, { error: "这条记录没有关联文章" });
      const restored = action === "restore";
      const metadata = article.metadata && typeof article.metadata === "object" ? article.metadata : {};
      await rest("articles", { method: "PATCH", query: { id: `eq.${article.id}` }, body: { status: restored ? "published" : "hidden", visibility: restored ? "public" : "private", metadata: { ...metadata, content_pool_action: action, content_pool_action_at: time, content_pool_action_by: user.id } }, prefer: "return=minimal" });
      await rest("news_candidates", { method: "PATCH", query: { id: `eq.${candidateId}` }, body: { decision: restored ? "published" : "taken_down", decision_reason: restored ? "管理员从内容池恢复发布" : "管理员从内容池下架", updated_at: time }, prefer: "return=minimal" });
      return json(200, { ok: true });
    }
    if (action === "delete") {
      if (article) {
        await rest("news_candidates", { method: "PATCH", query: { id: `eq.${candidateId}` }, body: { article_id: null, decision: "deleted", decision_reason: "管理员删除前台文章；内容池原始记录保留", updated_at: time }, prefer: "return=minimal" });
        await rest("articles", { method: "DELETE", query: { id: `eq.${article.id}` }, prefer: "return=minimal" });
      } else {
        await rest("news_candidates", { method: "PATCH", query: { id: `eq.${candidateId}` }, body: { decision: "deleted", decision_reason: "管理员标记删除；内容池原始记录保留", updated_at: time }, prefer: "return=minimal" });
      }
      return json(200, { ok: true });
    }
    return json(400, { error: "不支持的操作" });
  } catch (error) {
    return json(Number(error.statusCode) || 500, { error: error.message || "内容池操作失败" });
  }
};
