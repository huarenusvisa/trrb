import crypto from "node:crypto";
import { evaluatePost, normalizeHandle } from "./ice-v2-source-policy.mjs";

const TERMS = [
  "ice", "immigration", "immigrant", "deport", "removal", "detention",
  "arrest", "raid", "enforcement", "ero", "hsi", "dhs", "uscis",
  "cbp", "border", "asylum", "287(g)", "sanctuary", "migrant",
  "移民", "驱逐", "遣返", "拘留", "逮捕", "突袭", "边境", "庇护"
];

export function selectedSources(policy, mode = "official") {
  const enabled = (policy.sources || []).filter((source) => source.enabled && source.verified);
  if (["newsroom", "media"].includes(mode)) return enabled.filter((source) => source.class === "newsroom");
  if (mode === "policy") return enabled.filter((source) => ["policy_official", "official_office"].includes(source.class));
  if (mode === "agency") return enabled.filter((source) => source.class === "official_agency");
  if (mode === "official") return enabled.filter((source) => ["official_agency", "official_office", "policy_official"].includes(source.class));
  if (mode === "all") return enabled;
  throw new Error(`不支持的采集模式：${mode}`);
}

export const sourceQuery = (source) => `from:${source.handle} -is:reply -is:retweet`;
export const queryKey = (source) => `ice-v2:${source.class}:${normalizeHandle(source.handle)}`;

export function normalizedText(value) {
  return String(value ?? "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
}

export function immigrationRelevant(value, source) {
  const body = normalizedText(value);
  return (source.topics || []).some((term) => body.includes(String(term).toLowerCase())) || TERMS.some((term) => body.includes(term));
}

export function acceptTweet(policy, source, tweet, author = {}) {
  const decision = evaluatePost(policy, { ...tweet, author_username: author.username || source.handle });
  if (!decision.accepted) return decision;
  if (!immigrationRelevant(tweet.text, source)) return { accepted: false, reason: "not_immigration_relevant", source };
  return decision;
}

export function eventFingerprint(tweet, source) {
  const day = String(tweet.created_at || "").slice(0, 10);
  const core = normalizedText(tweet.text)
    .replace(/\b(the|a|an|and|or|to|of|for|in|on|at|is|are|was|were|said|says)\b/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 420);
  return crypto.createHash("sha256").update(`${day}|${source.class}|${core}`).digest("hex").slice(0, 40);
}

export function mediaFor(tweet, includes = {}) {
  const map = new Map((includes.media || []).map((item) => [item.media_key, item]));
  return (tweet.attachments?.media_keys || [])
    .map((key) => map.get(key))
    .filter(Boolean)
    .map((item) => ({
      type: item.type,
      url: item.url || item.preview_image_url || "",
      preview_image_url: item.preview_image_url || item.url || "",
      width: item.width || null,
      height: item.height || null
    }));
}
