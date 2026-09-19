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
      // Match the ICE review queue: the default view contains only work that
      // still needs attention. Published and other terminal records remain in
      // the database for audit/deduplication and are available through history.
      const rows = await rest("news_candidates", { query: { select: "id,external_id,pipeline,proposed_section,source_url,source_account,source_name,raw_text,raw_payload,ai_payload,decision,decision_reason,article_id,collected_at,processed_at,created_at,updated_at", pipeline: "like.china-hot-li-teacher%", ...(input.include_history ? {} : { decision: "in.(processing,pending_review,ready_for_review,review_required,failed,taken_down)" }), order: "collected_at.desc", limit: input.include_history ? "500" : "200" } });
      return json(200, { ok: true, items: Array.isArray(rows) ? rows : [] });
    }
    const candidateId = safeText(input.id, 100);
    if (!candidateId) return json(400, { error: "缺少内容池记录ID" });
    const candidates = await rest("news_candidates", { query: { select: "*", id: `eq.${candidateId}`, pipeline: "like.china-hot-li-teacher%", limit: "1" } });
    const candidate = Array.isArray(candidates) ? candidates[0] : null;
    if (!candidate) return json(404, { error: "内容池记录不存在" });
    const article = await articleFor(candidate.article_id);
    const time = new Date().toISOString();
    if (action === "retry") {
      if (!["review_required", "failed"].includes(candidate.decision)) return json(409, { error: "只有需要重新加工或加工失败的内容才能加入重试队列" });
      const aiPayload = candidate.ai_payload && typeof candidate.ai_payload === "object" ? candidate.ai_payload : {};
      await rest("news_candidates", {
        method: "PATCH", query: { id: `eq.${candidateId}` }, prefer: "return=minimal",
        body: {
          decision: "failed", decision_reason: "管理员已请求重新加工，等待下一轮采集任务按新版规则处理",
          ai_payload: { ...aiPayload, status: "queued_for_reprocess", automatic_retry_attempts: 0, automatic_retry_at: time, automatic_retry_exhausted: false },
          updated_at: time,
        },
      });
      return json(200, { ok: true, queued: true });
    }
    if (["take_down", "restore"].includes(action)) {
      if (!article) return json(409, { error: "这条记录没有关联文章" });
      if (action === "take_down" && candidate.decision !== "published") return json(409, { error: "只有已发布文章才能下架" });
      if (action === "restore" && candidate.decision !== "taken_down") return json(409, { error: "未经加工的审核草稿不能直接恢复发布，请先重新加工或人工编辑" });
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
