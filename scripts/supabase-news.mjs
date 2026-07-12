const DEFAULT_AUTHOR = "唐人日报 AI 编辑部";
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function normalizeSupabaseProjectUrl(value = process.env.SUPABASE_URL || "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    // Users sometimes paste the REST endpoint instead of the project URL.
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw.replace(/\/+$/, "").replace(/\/rest\/v1.*$/i, "");
  }
}

export function hasSupabaseAutomationConfig() {
  return Boolean(normalizeSupabaseProjectUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function request(path, options = {}, config = {}) {
  if (!hasSupabaseAutomationConfig()) return null;
  const root = normalizeSupabaseProjectUrl();
  const endpoint = new URL(`/rest/v1/${String(path).replace(/^\/+/, "")}`, `${root}/`).toString();
  const attempts = Number(config.attempts || 4);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, { ...options, headers: headers(options.headers || {}) });
      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : null;
      const error = new Error(`Supabase ${response.status} ${response.statusText}: ${text.slice(0, 1000)}`);
      error.status = response.status;
      error.endpoint = endpoint;
      if (!TRANSIENT_STATUS.has(response.status) || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if ((status && !TRANSIENT_STATUS.has(status)) || attempt === attempts) throw error;
    }
    await wait(Math.min(15000, 800 * 2 ** (attempt - 1)));
  }
  throw lastError || new Error("Unknown Supabase request failure");
}

export async function checkSupabaseHealth() {
  if (!hasSupabaseAutomationConfig()) return { configured: false };
  const required = ["articles", "automation_logs", "news_sources", "news_candidates"];
  const results = {};
  for (const table of required) {
    try {
      await request(`${table}?select=*&limit=0`, { method: "GET" }, { attempts: 2 });
      results[table] = true;
    } catch (error) {
      results[table] = false;
      results[`${table}_error`] = error.message;
    }
  }
  return { configured: true, projectUrl: normalizeSupabaseProjectUrl(), tables: results };
}

export async function resolveCategory(name) {
  const encoded = encodeURIComponent(name);
  const rows = await request(`categories?select=id,name&name=eq.${encoded}&limit=1`, { method: "GET" });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export function makeSeoKeywords({ title = "", category = "", tags = [], city = "", state = "" }) {
  return [...new Set([category, ...tags, city, state, ...String(title).split(/[\s，。、“”：《》()（）]+/)])]
    .map(v => String(v || "").trim()).filter(v => v.length >= 2 && v.length <= 24).slice(0, 12).join(", ");
}

export function makeSlug(value, fallback = "news") {
  const normalized = String(value || "").normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return normalized || fallback;
}

export async function upsertAutomatedArticle(input) {
  if (!hasSupabaseAutomationConfig()) return { skipped: true, reason: "Supabase automation secrets not configured" };
  const category = await resolveCategory(input.categoryName);
  const now = new Date().toISOString();
  const payload = {
    title: input.title,
    slug: input.slug || makeSlug(input.title, input.externalId),
    summary: input.summary || "",
    content: Array.isArray(input.bodyParagraphs) ? input.bodyParagraphs.join("\n\n") : String(input.content || ""),
    category_id: category?.id || null,
    category_name: input.categoryName,
    cover_image: input.coverImage || "",
    seo_keywords: input.seoKeywords || makeSeoKeywords(input),
    seo_title: input.seoTitle || input.title,
    seo_description: input.seoDescription || input.summary || "",
    canonical_url: input.canonicalUrl || "",
    image_alt: input.imageAlt || input.title,
    author: input.author || DEFAULT_AUTHOR,
    status: input.status === "published" ? "published" : "draft",
    visibility: input.status === "published" ? "public" : "private",
    published_at: input.status === "published" ? (input.publishedAt || now) : null,
    source_url: input.sourceUrl || "",
    source_name: input.sourceName || "",
    source_account: input.sourceAccount || "",
    source_level: input.sourceLevel || "",
    ai_confidence: Number(input.confidence || 0),
    ai_review_reason: input.reviewReason || "",
    automation_source: input.automationSource || "",
    external_id: input.externalId,
    event_date: input.eventDate || null,
    arrest_count: Number.isInteger(input.arrestCount) ? input.arrestCount : null,
    city: input.city || "",
    state: input.state || "",
    count_in_ice_stats: Boolean(input.countInIceStats),
    primary_section: input.primarySection || "",
    related_sections: input.relatedSections || [],
    risk_flags: input.riskFlags || [],
    independent_source_count: Number(input.independentSourceCount || 1),
    supporting_sources: input.supportingSources || [],
    updated_at: now,
  };
  const rows = await request("articles?on_conflict=external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  const article = Array.isArray(rows) ? rows[0] : rows;
  if (!article?.id) throw new Error(`Supabase article upsert returned no article id for ${input.externalId}`);
  return { skipped: false, article };
}

export async function upsertNewsCandidate(input) {
  if (!hasSupabaseAutomationConfig()) return { skipped: true };
  const payload = {
    external_id: input.externalId,
    pipeline: input.pipeline,
    source_url: input.sourceUrl || "",
    source_account: input.sourceAccount || "",
    source_name: input.sourceName || "",
    source_level: input.sourceLevel || "",
    raw_text: input.rawText || "",
    raw_payload: input.rawPayload || {},
    ai_payload: input.aiPayload || {},
    proposed_section: input.proposedSection || "",
    confidence: Number(input.confidence || 0),
    decision: input.decision || "pending",
    decision_reason: input.decisionReason || "",
    article_id: input.articleId || null,
    collected_at: input.collectedAt || new Date().toISOString(),
    processed_at: input.processedAt || null,
    updated_at: new Date().toISOString(),
  };
  const rows = await request("news_candidates?on_conflict=external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  return { skipped: false, candidate: Array.isArray(rows) ? rows[0] : rows };
}

export async function syncSourceRegistry(rows) {
  if (!hasSupabaseAutomationConfig()) return { skipped: true };
  if (!Array.isArray(rows) || rows.length === 0) return { skipped: false, count: 0 };

  const now = new Date().toISOString();
  // PostgREST bulk inserts require every object in the JSON array to have
  // exactly the same keys. Normalize all registry rows to the database schema
  // instead of forwarding heterogeneous JSON objects directly.
  const payload = rows.map(item => ({
    id: String(item?.id || "").trim(),
    name: String(item?.name || item?.id || "").trim(),
    agency: String(item?.agency || ""),
    branch: String(item?.branch || ""),
    level: String(item?.level || "media"),
    state: String(item?.state || ""),
    city: String(item?.city || ""),
    coverage_area: Array.isArray(item?.coverage_area) ? item.coverage_area : [],
    source_type: String(item?.source_type || "media"),
    source_level: String(item?.source_level || "C"),
    website: String(item?.website || ""),
    newsroom_url: String(item?.newsroom_url || ""),
    rss_url: String(item?.rss_url || ""),
    x_account: String(item?.x_account || ""),
    active: item?.active !== false,
    last_checked_at: item?.last_checked_at || null,
    last_success_at: item?.last_success_at || null,
    updated_at: now,
  })).filter(item => item.id && item.name);

  if (payload.length === 0) return { skipped: false, count: 0 };

  await request("news_sources?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  return { skipped: false, count: payload.length };
}

export async function writeAutomationLog(log) {
  if (!hasSupabaseAutomationConfig()) return { skipped: true };
  const payload = {
    pipeline: log.pipeline,
    run_at: log.runAt || new Date().toISOString(),
    fetched: Number(log.fetched || 0), processed: Number(log.processed || 0),
    published: Number(log.published || 0), drafted: Number(log.drafted || 0),
    duplicates: Number(log.duplicates || 0), failed: Number(log.failed || 0), details: log.details || {},
  };
  await request("automation_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
  return { skipped: false };
}
