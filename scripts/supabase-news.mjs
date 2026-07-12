const DEFAULT_AUTHOR = "唐人日报 AI 编辑部";

export function hasSupabaseAutomationConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function baseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
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

async function request(path, options = {}) {
  if (!hasSupabaseAutomationConfig()) return null;
  const response = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers || {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

export async function resolveCategory(name) {
  const encoded = encodeURIComponent(name);
  const rows = await request(`categories?select=id,name&name=eq.${encoded}&limit=1`, { method: "GET" });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export function makeSeoKeywords({ title = "", category = "", tags = [], city = "", state = "" }) {
  return [...new Set([category, ...tags, city, state, ...String(title).split(/[\s，。、“”：《》()（）]+/)])]
    .map(v => String(v || "").trim())
    .filter(v => v.length >= 2 && v.length <= 24)
    .slice(0, 12)
    .join(", ");
}

export function makeSlug(value, fallback = "news") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
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
    updated_at: now,
  };
  const path = `articles?on_conflict=external_id`;
  const rows = await request(path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  return { skipped: false, article: Array.isArray(rows) ? rows[0] : rows };
}

export async function writeAutomationLog(log) {
  if (!hasSupabaseAutomationConfig()) return { skipped: true };
  const payload = {
    pipeline: log.pipeline,
    run_at: log.runAt || new Date().toISOString(),
    fetched: Number(log.fetched || 0),
    processed: Number(log.processed || 0),
    published: Number(log.published || 0),
    drafted: Number(log.drafted || 0),
    duplicates: Number(log.duplicates || 0),
    failed: Number(log.failed || 0),
    details: log.details || {},
  };
  await request("automation_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  return { skipped: false };
}
