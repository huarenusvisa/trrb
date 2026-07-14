const {
  safeText,
  rest,
  authenticateAdmin
} = require("./_shared/supabase-admin");
const { prepareStories } = require("./_shared/ice-review-list");
const {
  filterReviewScope,
  attachEvidenceSummaries
} = require("./_shared/ice-v2-review");

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
      limit: "500"
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
        select: "id,event_fingerprint,event_type,event_date,state_code,city,source_text,source_username,source_display_name,source_created_at,media,trust_tier,processing_status,last_error,source_type",
        event_fingerprint: `in.(${batch.join(",")})`,
        processing_status: "neq.irrelevant",
        order: "trust_tier.asc,source_created_at.asc",
        limit: "2000"
      }
    });
    for (const post of Array.isArray(rows) ? rows : []) {
      if (["individual", "discovered_individual", "verified_discovered"].includes(String(post.source_type || ""))) continue;
      const key = String(post.event_fingerprint || "");
      if (key && !map.has(key)) map.set(key, post);
    }
  }
  return map;
}

async function loadEvidence(stories) {
  const ids = stories.map((story) => safeText(story.id, 100)).filter(Boolean);
  const map = new Map();
  for (let offset = 0; offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const rows = await rest("ice_story_evidence", {
      query: {
        select: "story_id,post_id,source_type,independence_key,trust_tier,x_post_id,x_url",
        story_id: `in.(${batch.join(",")})`,
        order: "trust_tier.asc",
        limit: "3000"
      }
    });
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = String(row.story_id || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
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

async function pipelineStatus(stories) {
  const [posts, states] = await Promise.all([
    rest("ice_posts", {
      query: {
        select: "processing_status,created_at,source_created_at,last_error,raw_payload",
        order: "created_at.desc",
        limit: "1500"
      }
    }),
    rest("ice_query_state", {
      query: {
        select: "query_key,last_run_at,last_success_at,last_error,last_result,updated_at",
        order: "updated_at.desc",
        limit: "500"
      }
    })
  ]);
  const postRows = (Array.isArray(posts) ? posts : []).filter((post) => post?.raw_payload?.collector === "ice-v2");
  const stateRows = (Array.isArray(states) ? states : []).filter((row) => String(row.query_key || "").startsWith("ice-v2:"));
  const successful = stateRows.map((row) => row.last_success_at).filter(Boolean).sort().at(-1) || null;
  const latestRun = stateRows.map((row) => row.last_run_at).filter(Boolean).sort().at(-1) || null;
  const errors = stateRows.filter((row) => row.last_error).slice(0, 8).map((row) => ({
    query_key: row.query_key,
    error: row.last_error,
    updated_at: row.updated_at
  }));
  return {
    version: "ice-v2",
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
    const scope = ["v2", "legacy", "all"].includes(input.scope) ? input.scope : "v2";
    const allStories = await loadStories();
    const scopedStories = filterReviewScope(allStories, scope);
    const [postsByFingerprint, evidenceByStory] = await Promise.all([
      loadLeadPosts(scopedStories),
      loadEvidence(scopedStories)
    ]);
    const prepared = prepareStories(scopedStories, postsByFingerprint);
    const visible = attachEvidenceSummaries(prepared, evidenceByStory);
    return json(200, {
      stories: visible,
      scope,
      pipeline: await pipelineStatus(scopedStories),
      dedupe: {
        scanned: scopedStories.length,
        visible: visible.length,
        hidden_duplicates: Math.max(0, scopedStories.length - visible.length)
      }
    });
  } catch (error) {
    console.error("ICE review list v3 error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
