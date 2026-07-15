function safeText(value, max = 30000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function isV2Story(story = {}) {
  const payload = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
  return Boolean(payload.v2_event_engine || String(story.event_fingerprint || "").startsWith("v2-"));
}

function publishableStory(story = {}) {
  if (!isV2Story(story)) return { ok: false, reason: "not_ice_v2_story" };
  if (["rejected", "failed"].includes(String(story.status || ""))) return { ok: false, reason: "story_not_publishable" };
  if (story.article_id || story.status === "published") return { ok: true, already_published: true };
  return { ok: true, already_published: false };
}

function publicationIdentity(story = {}) {
  const fingerprint = safeText(story.event_fingerprint, 160);
  if (!fingerprint) throw new Error("ICE v2事件缺少event_fingerprint");
  return {
    source_platform: "ice_v2_event",
    source_post_id: fingerprint,
    slug: `ice-${fingerprint}`.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").slice(0, 180)
  };
}

function normalizeEvidence(rows = []) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(rows) ? rows : []) {
    const key = safeText(item?.independence_key || item?.x_post_id || item?.post_id, 300);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({
      post_id: safeText(item?.x_post_id || item?.post_id, 200),
      url: safeText(item?.x_url, 3000),
      source_type: safeText(item?.source_type, 80),
      independence_key: key
    });
  }
  return output;
}

module.exports = {
  safeText,
  isV2Story,
  publishableStory,
  publicationIdentity,
  normalizeEvidence
};