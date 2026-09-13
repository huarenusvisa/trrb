const SITE = "https://huarengongzuo.com";
const PAGE_SIZE = 1000;
const EVERGREEN_URLS = [
  ["/", "1.0"], ["/jobs/", "0.9"],
  ["/jobs/locations/new-york/", "0.8"], ["/jobs/locations/flushing/", "0.8"],
  ["/jobs/locations/los-angeles/", "0.8"], ["/jobs/locations/boston/", "0.8"],
  ["/jobs/locations/houston/", "0.8"], ["/jobs/categories/restaurant/", "0.8"],
  ["/jobs/categories/driver/", "0.8"], ["/jobs/categories/warehouse/", "0.8"],
  ["/jobs/categories/beauty-nail/", "0.8"], ["/jobs/categories/home-care/", "0.8"],
  ["/ershou/", "0.7"]
] as const;

export const config = { path: "/sitemap.xml" };

function clean(value: unknown): string { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function esc(value: unknown): string {
  return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function supabaseConfig() {
  return { base: (Netlify.env.get("SUPABASE_URL") || "").replace(/\/+$/, ""), key: Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" };
}
async function jobs() {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase server configuration missing");
  const url = new URL(`${base}/rest/v1/job_listings`);
  url.searchParams.set("select", "id,published_at,updated_at");
  url.searchParams.set("status", "eq.open");
  url.searchParams.set("moderation_hold", "eq.false");
  url.searchParams.set("deleted_at", "is.null");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(PAGE_SIZE));
  const jobs: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`job_listings ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid jobs sitemap response");
    jobs.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  // Never silently emit an invalid or truncated sitemap.
  if (jobs.length + EVERGREEN_URLS.length > 50000) throw new Error("Sitemap requires an index with child sitemaps");
  return jobs;
}
function lastmod(value: unknown): string | null {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0,10);
}
function block(loc: string, lastmod: string | null, priority: string) {
  const modified = lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : "";
  return `  <url>\n    <loc>${esc(loc)}</loc>${modified}\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}
export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  if (new URL(request.url).hostname.toLowerCase() !== "huarengongzuo.com") return context.next();
  try {
    const rows = await jobs();
    const blocks = [
      ...EVERGREEN_URLS.map(([path, priority]) => block(`${SITE}${path}`, null, priority)),
      ...rows.map((job: any) => block(
        `${SITE}/jobs/listing.html?id=${encodeURIComponent(job.id)}`,
        lastmod(job.updated_at || job.published_at),
        "0.8"
      ))
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
    const responseHeaders = new Headers({
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
      "x-hg-sitemap": "public-jobs-v2",
      "x-hg-sitemap-jobs": String(rows.length)
    });
    return new Response(request.method === "HEAD" ? null : xml, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error("Huaren Gongzuo jobs sitemap failed", error);
    return context.next();
  }
};
