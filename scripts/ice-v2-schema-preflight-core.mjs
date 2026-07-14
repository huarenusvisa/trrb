const REQUIRED_TABLES = {
  articles: ["id", "title", "content", "status", "topic_key", "source_platform", "source_post_id", "metadata"],
  ice_query_state: ["query_key", "query_text", "last_seen_id", "last_run_at", "last_success_at", "last_error", "last_result"],
  ice_posts: ["id", "x_post_id", "source_type", "source_text", "raw_payload", "processing_status", "event_fingerprint"],
  ice_stories: ["id", "event_fingerprint", "title", "summary", "content", "status", "human_review_status", "ai_payload", "article_id"],
  ice_story_evidence: ["story_id", "post_id", "source_type", "independence_key", "x_post_id", "x_url"],
  ice_review_logs: ["story_id", "reviewer_email", "action", "from_status", "to_status", "notes"]
};

export function requiredTables() {
  return structuredClone(REQUIRED_TABLES);
}

export function validateEnvironment(env = {}) {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "X_BEARER_TOKEN", "OPENAI_API_KEY"];
  const missing = required.filter((name) => !String(env[name] || "").trim());
  return { ok: missing.length === 0, missing };
}

export function validateSchemaResults(results = {}) {
  const failures = [];
  for (const [table, columns] of Object.entries(REQUIRED_TABLES)) {
    const result = results[table];
    if (!result?.ok) {
      failures.push({ table, reason: result?.error || "table_unavailable" });
      continue;
    }
    const returned = new Set(result.columns || []);
    const missingColumns = columns.filter((column) => !returned.has(column));
    if (missingColumns.length) failures.push({ table, reason: "missing_columns", columns: missingColumns });
  }
  return { ok: failures.length === 0, failures };
}

export function summarizePreflight({ environment, schema }) {
  return {
    ok: Boolean(environment?.ok && schema?.ok),
    environment,
    schema
  };
}
