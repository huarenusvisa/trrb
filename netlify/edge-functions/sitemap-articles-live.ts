import { articleIndexability } from "../shared/article-indexability.mjs";
import { publicationUrl } from "../shared/publication.mjs";
import { sitemapPublishedThrough } from "../shared/sitemap-snapshot.mjs";

const SITE = "https://trrb.net";
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 200;
const MAX_URLS = 50000;
export const config = { pattern: "^/(?:sitemap|sitemap-articles-live-\\d{4}-\\d{2}-\\d{2})\\.xml$" };

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export async function renderLiveSitemap(
  read: (table: string, params: Record<string, string>) => Promise<any[]>,
  after: string,
  through: string,
  day: string,
) {
  const categories = await read("categories", {
    select: "id,name", is_active: "eq.true", include_in_sitemap: "not.is.false",
  });
  const categoryIds = new Set(categories.map(row => row.id));
  const categoryNames = new Set(categories.map(row => row.name));
  const urls = new Map<string, string>();
  const seenBodies = new Set<string>();
  const start = Date.parse(after);
  const end = Date.parse(through);
  const dayStart = `${day}T00:00:00.000Z`;
  const dayStartTime = Date.parse(dayStart);
  const dayEndTime = dayStartTime + DAY_MS;
  const dayEnd = new Date(dayEndTime).toISOString();
  let previous: { published_at: string; id: string } | undefined;
  for (;;) {
    const filters = [`published_at.gt.${after}`, `published_at.lte.${through}`, `published_at.gte.${dayStart}`, `published_at.lt.${dayEnd}`];
    if (previous) {
      filters.push(`or(published_at.lt.${previous.published_at},and(published_at.eq.${previous.published_at},id.lt.${previous.id}))`);
    }
    const articles = await read("articles", {
      select: "id,publication_path,title,summary,content,category_id,category_name,topic_key,published_at,publication_updated_at",
      status: "eq.published", visibility: "eq.public", hidden_at: "is.null", archived_at: "is.null",
      and: `(${filters.join(",")})`, order: "published_at.desc,id.desc", limit: String(PAGE_SIZE),
    });
    for (const article of articles) {
      const date = Date.parse(article.published_at);
      // PostgREST applies the strict lower bound at database timestamp precision.
      if (!article.id || !(date >= start && date <= end && date >= dayStartTime && date < dayEndTime)) {
        throw new Error("Unexpected row outside the live sitemap window");
      }
      const sectionAllowed = ["ice", "trump"].includes(String(article.topic_key ?? "").trim().toLowerCase())
        || (article.category_id ? categoryIds.has(article.category_id) : !article.category_name || categoryNames.has(article.category_name));
      if (!sectionAllowed) continue;
      const loc = publicationUrl(article);
      const { body, indexable } = articleIndexability(article);
      if (!loc || !indexable || urls.has(loc) || (body.length >= 120 && seenBodies.has(body))) continue;
      if (body.length >= 120) seenBodies.add(body);
      const updated = Date.parse(article.publication_updated_at);
      const lastmod = Number.isFinite(updated) && updated <= end ? Math.max(date, updated) : date;
      urls.set(loc, new Date(lastmod).toISOString());
      if (urls.size > MAX_URLS) throw new Error("Live sitemap exceeds the URL limit");
    }
    if (articles.length < PAGE_SIZE) break;
    const next = articles.at(-1);
    if (!next || (previous?.id === next.id && previous?.published_at === next.published_at)) {
      throw new Error("Live sitemap cursor did not advance");
    }
    previous = next;
  }
  const entries = [...urls].map(([loc, lastmod]) => `  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

export function addLiveSitemapChildren(xml: string, after: string, through: string) {
  if (!xml.includes("<sitemapindex") || !xml.includes("</sitemapindex>")) return xml;
  const startOfFirstDay = Date.parse(`${after.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(through);
  const children = [];
  for (let timestamp = startOfFirstDay; timestamp <= end; timestamp += DAY_MS) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    children.push(`  <sitemap><loc>${SITE}/sitemap-articles-live-${day}.xml</loc></sitemap>`);
  }
  return xml.replace("</sitemapindex>", `${children.join("\n")}\n</sitemapindex>`);
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const { hostname, pathname } = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method) || !(hostname === "trrb.net" || hostname.endsWith("--trrb.netlify.app"))) return context.next();
  if (!sitemapPublishedThrough) return context.next();
  const through = new Date().toISOString();
  const headers = new Headers({ "content-type": "application/xml; charset=UTF-8", "cache-control": "public, max-age=60, stale-while-revalidate=300" });
  if (hostname !== "trrb.net") headers.set("x-robots-tag", "noindex");
  if (pathname === "/sitemap.xml") {
    const response = await context.next();
    if (!response.ok || request.method === "HEAD" || !response.headers.get("content-type")?.includes("xml")) return response;
    return new Response(addLiveSitemapChildren(await response.text(), sitemapPublishedThrough, through), { headers });
  }
  const day = pathname.match(/^\/sitemap-articles-live-(\d{4}-\d{2}-\d{2})\.xml$/)?.[1];
  if (!day || day < sitemapPublishedThrough.slice(0, 10) || day > through.slice(0, 10)) return context.next();
  const midnight = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return context.next();
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  try {
    if (!base || !key) throw new Error("Supabase config missing");
    const signal = AbortSignal.timeout(10000);
    const xml = await renderLiveSitemap(async (table, params) => {
      const url = new URL(`${base}/rest/v1/${table}`);
      url.search = new URLSearchParams(params).toString();
      const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, signal });
      if (!response.ok) throw new Error(`${table} returned HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error(`${table} did not return a row array`);
      return rows;
    }, sitemapPublishedThrough, through, day);
    return new Response(request.method === "HEAD" ? null : xml, { headers });
  } catch (error) {
    console.error("Live article sitemap failed", error);
    return new Response(null, { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } });
  }
};
