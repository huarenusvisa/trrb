const {
  safeText,
  rest,
  authenticateAdmin
} = require("./_shared/supabase-admin");
const { prepareStories } = require("./_shared/ice-review-list");

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

async function loadStories() {
  const rows = await rest("ice_stories", {
    query: {
      select: [
        "id","event_fingerprint","event_type","title","summary","content","cover_image",
        "first_seen_at","last_seen_at","independent_source_count","official_source_count","media_source_count",
        "organization_source_count","individual_source_count","total_score","ai_confidence",
        "conflict_detected","legal_risk","privacy_risk","fabrication_risk","decision_reason",
        "status","human_review_status","scheduled_at","article_id","published_at","reviewed_at",
        "reviewer_email","editor_notes","updated_at","ai_payload"
      ].join(","),
      status: "in.(collecting,pending_review,pending_corroboration,approved,published,rejected,failed)",
      order: "updated_at.desc",
      limit: "400"
    }
  });
  return (Array.isArray(rows) ? rows : []).filter((story) => !story?.ai_payload?.filtered_reply_only);
}

async function loadLeadPosts(stories) {
  const fingerprints = [...new Set(stories.map((story) => safeText(story.event_fingerprint, 100)).filter(Boolean))];
  const map = new Map();
  for (let offset = 0; offset < fingerprints.length; offset += 60) {
    const batch = fingerprints.slice(offset, offset + 60);
    const rows = await rest("ice_posts", {
      query: {
        select: "id,event_fingerprint,event_type,event_date,state_code,city,source_text,source_username,source_display_name,source_created_at,media,trust_tier,processing_status,last_error",
        event_fingerprint: `in.(${batch.join(",")})`,
        processing_status: "neq.irrelevant",
        order: "trust_tier.asc,source_created_at.asc",
        limit: "2000"
      }
    });
    for (const post of Array.isArray(rows) ? rows : []) {
      const key = String(post.event_fingerprint || "");
      if (key && !map.has(key)) map.set(key, post);
    }
  }
  return map;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = String(row?.[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function timeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function pipelineStatus(stories) {
  const [posts, states] = await Promise.all([
    rest("ice_posts", {
      query: {
        select: "processing_status,created_at,source_created_at,last_error",
        order: "created_at.desc",
        limit: "1000"
      }
    }),
    rest("ice_query_state", {
      query: {
        select: "query_key,last_run_at,last_success_at,last_error,last_result,updated_at",
        order: "updated_at.desc",
        limit: "120"
      }
    })
  ]);
  const postRows = Array.isArray(posts) ? posts : [];
  const stateRows = Array.isArray(states) ? states : [];
  const successful = stateRows.map((row) => row.last_success_at).filter(Boolean).sort().at(-1) || null;
  const latestRun = stateRows.map((row) => row.last_run_at).filter(Boolean).sort().at(-1) || null;

  // 只显示仍然有效的错误：
  // 1. 该查询的错误更新时间晚于它自己的最近成功时间；
  // 2. 并且错误属于当前活跃运行窗口，避免旧版query_key永久留在后台。
  const latestRunMs = timeValue(latestRun);
  const activeWindowStart = latestRunMs ? latestRunMs - 6 * 60 * 60 * 1000 : 0;
  const errors = stateRows
    .filter((row) => {
      if (!row.last_error) return false;
      const updatedMs = timeValue(row.updated_at || row.last_run_at);
      const successMs = timeValue(row.last_success_at);
      if (successMs && updatedMs <= successMs) return false;
      if (activeWindowStart && updatedMs < activeWindowStart) return false;
      return true;
    })
    .slice(0, 5)
    .map((row) => ({
      query_key: row.query_key,
      error: row.last_error,
      updated_at: row.updated_at
    }));

  return {
    last_run_at: latestRun,
    last_success_at: successful,
    post_counts: countBy(postRows, "processing_status"),
    story_counts: countBy(stories, "status"),
    recent_errors: errors,
    sampled_posts: postRows.length,
    query_count: stateRows.length
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    await authenticateAdmin(event);
    const input = JSON.parse(event.body || "{}");
    if (safeText(input.action, 40) !== "list") return json(400, { error: "只支持list操作" });
    const stories = await loadStories();
    const postsByFingerprint = await loadLeadPosts(stories);
    const visible = prepareStories(stories, postsByFingerprint);
    return json(200, {
      stories: visible,
      pipeline: await pipelineStatus(stories),
      dedupe: {
        scanned: stories.length,
        visible: visible.length,
        hidden_duplicates: Math.max(0, stories.length - visible.length)
      }
    });
  } catch (error) {
    console.error("ICE review list v3 error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
