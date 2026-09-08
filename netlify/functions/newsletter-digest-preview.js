const { authenticateStaff, rest } = require("./_shared/supabase-admin");
const { FALLBACK_WINDOW_MS, selectDigestArticles, buildDigestEmail } = require("./_shared/newsletter-digest-core");

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function createHandler(dependencies = {}) {
  const authenticate = dependencies.authenticateStaff || authenticateStaff;
  const queryArticles = dependencies.rest || rest;
  const now = dependencies.now || (() => Date.now());

  return async function handler(event) {
    if (event.httpMethod === "OPTIONS") return response(204, {});
    if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

    try {
      await authenticate(event, ["owner", "editor"]);
      const nowMs = now();
      const rows = await queryArticles("articles", {
        query: {
          select: "id,title,slug,summary,category_name,status,visibility,published_at,created_at,is_breaking,rank_score",
          status: "eq.published",
          visibility: "eq.public",
          published_at: `gte.${new Date(nowMs - FALLBACK_WINDOW_MS).toISOString()}`,
          order: "published_at.desc.nullslast,created_at.desc",
          limit: "160"
        }
      });
      const digest = selectDigestArticles(rows, { nowMs });
      const email = buildDigestEmail(digest.selected, {
        issueDate: new Date(nowMs).toISOString().slice(0, 10)
      });
      return response(200, {
        generated_at: new Date(nowMs).toISOString(),
        preview_only: true,
        dispatch_enabled: false,
        ready: digest.ready,
        article_count: digest.selected.length,
        eligible_count: digest.eligibleCount,
        used_fallback_window: digest.usedFallbackWindow,
        subject: email.subject,
        articles: email.items,
        note: digest.ready
          ? "Digest selection is ready for review. This endpoint never sends email."
          : `At least ${digest.minimum} eligible published articles are required before dispatch.`
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("Newsletter digest preview error:", error);
      return response(statusCode, { error: error.message || String(error) });
    }
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
