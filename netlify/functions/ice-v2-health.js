const { rest, authenticateAdmin } = require("./_shared/supabase-admin");
const { summarizeStates } = require("./_shared/ice-v2-health");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function isV2Post(row) {
  const payload = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  return payload.collector === "ice-v2";
}

async function countPosts(status) {
  const rows = await rest("ice_posts", {
    query: {
      select: "id,raw_payload",
      processing_status: `eq.${status}`,
      order: "created_at.desc",
      limit: "5000"
    }
  });
  return (Array.isArray(rows) ? rows : []).filter(isV2Post).length;
}

async function countStories(status) {
  const rows = await rest("ice_stories", {
    query: {
      select: "id,event_fingerprint,ai_payload",
      status: `eq.${status}`,
      event_fingerprint: "like.v2-*",
      limit: "5000"
    }
  });
  return Array.isArray(rows) ? rows.length : 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    await authenticateAdmin(event);
    const states = await rest("ice_query_state", {
      query: {
        select: "query_key,query_text,last_run_at,last_success_at,last_error,last_result,updated_at",
        query_key: "like.ice-v2:%",
        order: "query_key.asc",
        limit: "500"
      }
    });

    const health = summarizeStates(Array.isArray(states) ? states : [], 30);
    const [collected, clustered, failedPosts, waiting, review, failedStories] = await Promise.all([
      countPosts("collected"),
      countPosts("clustered"),
      countPosts("failed"),
      countStories("pending_corroboration"),
      countStories("pending_review"),
      countStories("failed")
    ]);

    return json(200, {
      generated_at: new Date().toISOString(),
      scope: "ice-v2",
      ...health,
      queue: {
        posts_collected: collected,
        posts_clustered: clustered,
        posts_failed: failedPosts,
        stories_waiting_corroboration: waiting,
        stories_pending_review: review,
        stories_failed: failedStories
      }
    });
  } catch (error) {
    console.error("ICE v2 health error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

exports.isV2Post = isV2Post;
