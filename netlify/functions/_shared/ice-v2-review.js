function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function isV2Story(story) {
  const payload = safeJson(story?.ai_payload, {});
  return Boolean(payload.v2_event_engine || String(story?.event_fingerprint || "").startsWith("v2-"));
}

function filterReviewScope(stories, scope = "v2") {
  const rows = Array.isArray(stories) ? stories : [];
  if (scope === "all") return rows;
  if (scope === "legacy") return rows.filter((story) => !isV2Story(story));
  return rows.filter(isV2Story);
}

function evidenceSummary(rows) {
  const evidence = Array.isArray(rows) ? rows : [];
  const sourceKeys = new Set();
  let official = 0;
  let media = 0;
  for (const row of evidence) {
    const type = String(row?.source_type || "");
    if (["individual", "discovered_individual", "verified_discovered"].includes(type)) continue;
    if (row?.independence_key) sourceKeys.add(String(row.independence_key));
    if (type === "official") official += 1;
    if (["major_media", "media", "newsroom"].includes(type)) media += 1;
  }
  return {
    evidence_count: evidence.length,
    independent_source_count: sourceKeys.size,
    official_source_count: official,
    media_source_count: media
  };
}

function attachEvidenceSummaries(stories, evidenceByStory) {
  return (Array.isArray(stories) ? stories : []).map((story) => ({
    ...story,
    is_v2: isV2Story(story),
    ...evidenceSummary(evidenceByStory.get(String(story.id)) || [])
  }));
}

module.exports = {
  safeJson,
  isV2Story,
  filterReviewScope,
  evidenceSummary,
  attachEvidenceSummaries
};
