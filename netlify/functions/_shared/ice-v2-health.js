function safeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function ageMinutes(value, now = new Date()) {
  const date = safeDate(value);
  if (!date) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function classifyKey(key = "") {
  if (key.includes(":newsroom:")) return "newsroom";
  if (key.includes(":official_agency:") || key.includes(":official_office:") || key.includes(":policy_official:")) return "official";
  return "other";
}

function resultSummary(value) {
  const row = value && typeof value === "object" ? value : {};
  if (row.error) return `错误：${String(row.error).slice(0, 120)}`;
  const parts = [];
  for (const key of ["fetched", "inserted", "rejected", "failed"]) {
    if (row[key] !== undefined && row[key] !== null) parts.push(`${key}=${Number(row[key]) || 0}`);
  }
  return parts.join("，") || "-";
}

function summarizeStates(rows = [], staleAfterMinutes = 30, now = new Date()) {
  const groups = {
    official: { sources: 0, healthy: 0, stale: 0, failed: 0, last_success_at: null },
    newsroom: { sources: 0, healthy: 0, stale: 0, failed: 0, last_success_at: null },
    other: { sources: 0, healthy: 0, stale: 0, failed: 0, last_success_at: null }
  };
  const sources = [];

  for (const row of rows) {
    const groupName = classifyKey(String(row.query_key || ""));
    const group = groups[groupName];
    const minutes = ageMinutes(row.last_success_at, now);
    const failed = Boolean(row.last_error);
    const stale = minutes === null || minutes > staleAfterMinutes;
    const status = failed ? "failed" : stale ? "stale" : "healthy";
    group.sources += 1;
    group[status] += 1;
    if (row.last_success_at && (!group.last_success_at || row.last_success_at > group.last_success_at)) group.last_success_at = row.last_success_at;
    sources.push({
      query_key: row.query_key,
      query_text: row.query_text || "",
      group: groupName,
      status,
      state: status,
      status_label: status === "healthy" ? "正常" : status === "stale" ? "超时" : "失败",
      age_minutes: minutes,
      last_run_at: row.last_run_at || null,
      last_success_at: row.last_success_at || null,
      last_error: row.last_error || null,
      last_result: row.last_result || null,
      result_summary: resultSummary(row.last_result)
    });
  }

  return {
    status: sources.some((item) => item.status === "failed") ? "failed" : sources.some((item) => item.status === "stale") ? "degraded" : "healthy",
    stale_after_minutes: staleAfterMinutes,
    groups,
    sources
  };
}

module.exports = { safeDate, ageMinutes, classifyKey, resultSummary, summarizeStates };
