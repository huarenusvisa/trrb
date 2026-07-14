import { normalizeHandle } from "./ice-v2-source-policy.mjs";

const DENIED_TYPES = new Set([
  "individual",
  "discovered_individual",
  "verified_discovered",
  "blogger",
  "commentator",
  "influencer",
  "activist",
  "aggregator"
]);

export function allowedHandles(policy) {
  return new Set((policy.sources || [])
    .filter((source) => source.enabled && source.verified)
    .map((source) => normalizeHandle(source.handle)));
}

export function cleanupDecision(policy, post = {}) {
  const handle = normalizeHandle(post.source_username || post.author_username || post.username);
  const type = String(post.source_type || "").toLowerCase();
  const payload = post.raw_payload && typeof post.raw_payload === "object" ? post.raw_payload : {};
  const collector = String(payload.collector || "");

  if (collector === "ice-v2") return { action: "keep", reason: "ice_v2_record" };
  if (DENIED_TYPES.has(type)) return { action: "exclude", reason: `denied_source_type:${type}` };
  if (!handle) return { action: "exclude", reason: "missing_source_handle" };
  if (!allowedHandles(policy).has(handle)) return { action: "exclude", reason: "source_not_in_v2_whitelist" };
  return { action: "keep", reason: "legacy_whitelisted_source" };
}

export function cleanupPatch(reason) {
  return {
    relevant: false,
    processing_status: "irrelevant",
    last_error: `ice_v2_cleanup:${reason}`
  };
}

export function summarizeCleanup(rows, policy) {
  const summary = { scanned: 0, keep: 0, exclude: 0, reasons: {} };
  for (const row of rows || []) {
    const decision = cleanupDecision(policy, row);
    summary.scanned += 1;
    summary[decision.action] += 1;
    summary.reasons[decision.reason] = (summary.reasons[decision.reason] || 0) + 1;
  }
  return summary;
}
