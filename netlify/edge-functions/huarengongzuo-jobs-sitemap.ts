const SITE = "https://huarengongzuo.com";
const MIN_DESCRIPTION = 100;
const MAX_JOBS = 1000;
const OFFICIAL_APPLY_SOURCE = /^(greenhouse_|jazzhr_|lever_|workday_|ashby_)/i;

export const config = { path: "/sitemap.xml" };

function clean(value: unknown): string { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function esc(value: unknown): string {
  return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function publicAction(job: any): boolean {
  if (job.contact_public && ["phone","email"].includes(clean(job.contact_method)) && clean(job.contact_value)) return true;
  return OFFICIAL_APPLY_SOURCE.test(clean(job.source_key)) && /^https?:\/\//i.test(clean(job.application_url));
}
function eligible(job: any): boolean {
  const expires = new Date(String(job.expires_at || "")).getTime();
  return Boolean(
    clean(job.company_name) && clean(job.description).length >= MIN_DESCRIPTION &&
    clean(job.title) && clean(job.city) && clean(job.state_code) &&
    job.published_at && Number.isFinite(expires) && expires > Date.now() && publicAction(job)
  );
}
function supabaseConfig() {
  return { base: (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, ""), key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" };
}
async function jobs() {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase server configuration missing");
  const url = new URL(`${base}/rest/v1/job_listings`);
  url.searchParams.set("select", "id,title,description,company_name,city,state_code,status,published_at,updated_at,expires_at,moderation_hold,contact_method,contact_value,contact_public,application_url,source_key");
  url.searchParams.set("status", "eq.open");
  url.searchParams.set("moderation_hold", "eq.false");
  url.searchParams.set("order", "updated_at.desc");
  url.searchParams.set("limit", String(MAX_JOBS));
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`job_listings ${response.status}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).filter(eligible);
}
function block(loc: string, lastmod: string, priority: string) {
  return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${esc(lastmod)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}
export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  if (new URL(request.url).hostname.toLowerCase() !== "huarengongzuo.com") return context.next();
  try {
    const rows = await jobs();
    const today = new Date().toISOString().slice(0,10);
    const blocks = [
      block(`${SITE}/`, today, "1.0"),
      block(`${SITE}/ershou/`, today, "0.7"),
      block(`${SITE}/jobs/publish.html`, today, "0.6"),
      block(`${SITE}/jobs/seeker.html`, today, "0.5"),
      ...rows.map((job: any) => block(
        `${SITE}/jobs/listing.html?id=${encodeURIComponent(job.id)}`,
        new Date(job.updated_at || job.published_at).toISOString().slice(0,10),
        "0.8"
      ))
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
    const responseHeaders = new Headers({
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
      "x-hg-sitemap": "google-jobs-quality-gated-v1",
      "x-hg-sitemap-jobs": String(rows.length),
      "x-hg-sitemap-min-description": String(MIN_DESCRIPTION)
    });
    return new Response(request.method === "HEAD" ? null : xml, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error("Huaren Gongzuo jobs sitemap failed", error);
    return context.next();
  }
};
