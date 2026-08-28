const { authenticateAdmin, rest, safeText } = require("./_shared/supabase-admin");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

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
    if (action !== "delete") return json(400, { error: "不支持的操作" });
    const id = safeText(input.id, 100);
    if (!id) return json(400, { error: "缺少内容池记录ID" });
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
