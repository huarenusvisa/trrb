(() => {
  "use strict";

  const RANK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const RANK_ALLOWED_CATEGORIES = Object.freeze([
    "热门头条",
    "美国时政",
    "美国警情",
    "ICE执法动态"
  ]);
  const RANK_ALLOWED_CATEGORY_SET = new Set(RANK_ALLOWED_CATEGORIES);
  const RANK_CATEGORY_ALIASES = new Map([
    ["中国热门头条", "热门头条"],
    ["驱逐快报", "ICE执法动态"],
    ["ICE执法", "ICE执法动态"],
    ["ICE执法追踪", "ICE执法动态"],
    ["ICE新闻", "ICE执法动态"]
  ]);

  function canonicalRankCategory(item) {
    const category = String(item?.category_name || item?.category || "").trim();
    return RANK_CATEGORY_ALIASES.get(category) || category;
  }

  function isAllowedRankCategory(item) {
    return RANK_ALLOWED_CATEGORY_SET.has(canonicalRankCategory(item));
  }

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
    const value = Date.parse(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function rankScore(item) {
    const value = Number(item?.rank_score ?? item?.rankScore ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  function normalizedTitle(item) {
    return String(item?.title || "")
      .toLowerCase()
      .replace(/[\p{P}\p{S}\s]+/gu, "")
      .trim();
  }

  function eventKey(item) {
    const explicit = String(item?.event_fingerprint || item?.event_key || "").trim();
    if (explicit) return `event:${explicit}`;
    const title = normalizedTitle(item);
    if (title) return `title:${title}`;
    const id = String(item?.id || "").trim();
    return id ? `id:${id}` : "";
  }

  function isPublicPublished(item) {
    const status = String(item?.status || "published").trim().toLowerCase();
    const visibility = String(item?.visibility || "public").trim().toLowerCase();
    return status === "published" && visibility === "public";
  }

  function select24hRank(items, options = {}) {
    const now = Number(options.now ?? Date.now());
    const limit = Math.max(1, Number(options.limit || 40));
    const seenEvents = new Set();
    const seenIds = new Set();

    return (Array.isArray(items) ? items : [])
      .filter((item) => item?.title && isPublicPublished(item))
      .filter(isAllowedRankCategory)
      .filter((item) => {
        const time = articleTime(item);
        const age = now - time;
        return time > 0 && age >= 0 && age <= RANK_MAX_AGE_MS;
      })
      .sort((a, b) => {
        const scoreDelta = rankScore(b) - rankScore(a);
        if (scoreDelta) return scoreDelta;
        const breakingDelta = Number(b?.is_breaking === true) - Number(a?.is_breaking === true);
        return breakingDelta || articleTime(b) - articleTime(a);
      })
      .filter((item) => {
        const id = String(item?.id || "").trim();
        const key = eventKey(item);
        if (!key || (id && seenIds.has(id)) || seenEvents.has(key)) return false;
        if (id) seenIds.add(id);
        seenEvents.add(key);
        return true;
      })
      .slice(0, limit);
  }

  const api = {
    RANK_MAX_AGE_MS,
    RANK_ALLOWED_CATEGORIES,
    articleTime,
    eventKey,
    rankScore,
    canonicalRankCategory,
    isAllowedRankCategory,
    select24hRank
  };
  if (typeof window !== "undefined") window.TRRB_HOME_RANKING = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
