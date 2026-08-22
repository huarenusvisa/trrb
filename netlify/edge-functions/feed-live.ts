const SITE = "https://trrb.net";
const ARTICLE_PAGE_SIZE = 200;
const FEED_ITEM_LIMIT = 100;
const MAX_ARTICLE_SCAN = 10000;

export const config = { path: "/feed.xml" };

const FALLBACK: Record<string, string> = {
  "重要新闻": "important-news", "热门头条": "hot-headlines", "美国时政": "us-politics",
  "美国警情": "us-crime", "中国官场": "china-officialdom", "移民美国": "immigration",
  "庇护百科": "asylum", "驱逐快报": "deport", "ICE执法动态": "ice", "ICE执法": "ice",
};
const ALIASES: Record<string, string> = { important: "important-news", hot: "hot-headlines", politics: "us-politics", crime: "us-crime", china: "china-officialdom" };
const clean = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
const canonicalSection = (v: unknown) => ALIASES[clean(v)] || clean(v);
const esc = (v: unknown) => clean(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function cfg() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

async function rows(path: string, params: Record<string, string>) {
  const { base, key } = cfg();
  if (!base || !key) throw new Error("Supabase config missing");
  const u = new URL(`${base}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function section(a: any, byId: Map<string, any>, byName: Map<string, any>) {
  const t = clean(a.topic_key).toLowerCase();
  if (t === "trump") return "trump";
  if (t === "ice") return "ice";
  const byIdSlug = clean(byId.get(String(a.category_id || ""))?.slug);
  if (byIdSlug) return canonicalSection(byIdSlug);
  const byNameSlug = clean(byName.get(clean(a.category_name))?.slug);
  if (byNameSlug) return canonicalSection(byNameSlug);
  return FALLBACK[clean(a.category_name)] || "news";
}

function topicCanonical(a: any) {
  const t = clean(a?.topic_key).toLowerCase();
  return t === "trump" || t === "ice";
}

function mime(v: string) {
  const p = v.split("?")[0].toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

export default async (request: Request, context: any) => {
  if (!["GET", "HEAD"].includes(request.method)) return context.next();
  try {
    const cats = await rows("categories", { select: "id,name,slug,is_active,include_in_rss", is_active: "eq.true", limit: "500" });
    const ids = new Set(cats.filter((x: any) => x.include_in_rss !== false).map((x: any) => String(x.id)));
    const names = new Set(cats.filter((x: any) => x.include_in_rss !== false).map((x: any) => clean(x.name)));
    const byId = new Map(cats.map((x: any) => [String(x.id || ""), x]));
    const byName = new Map(cats.map((x: any) => [clean(x.name), x]));
    const eligible: any[] = [];
    let scanned = 0;
    let pages = 0;

    while (eligible.length < FEED_ITEM_LIMIT && scanned < MAX_ARTICLE_SCAN) {
      const page = await rows("articles", {
        select: "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,status,visibility,published_at,created_at",
        status: "eq.published", visibility: "eq.public",
        order: "published_at.desc.nullslast,created_at.desc,id.asc",
        limit: String(ARTICLE_PAGE_SIZE), offset: String(scanned),
      });
      pages += 1;
      scanned += page.length;
      eligible.push(...page.filter((a: any) => topicCanonical(a) || !cats.length || (a.category_id ? ids.has(String(a.category_id)) : (!a.category_name || names.has(clean(a.category_name))))));
      if (page.length < ARTICLE_PAGE_SIZE) break;
    }

    if (scanned >= MAX_ARTICLE_SCAN && eligible.length < FEED_ITEM_LIMIT) {
      throw new Error(`feed scan safety limit reached: scanned=${scanned} eligible=${eligible.length}`);
    }

    const feedItems = eligible.slice(0, FEED_ITEM_LIMIT);
    const items = feedItems.map((a: any) => {
      const slug = clean(a.slug) || clean(a.id);
      const link = `${SITE}/${encodeURIComponent(section(a, byId, byName))}/${encodeURIComponent(slug)}`;
      const dt = new Date(a.published_at || a.created_at || Date.now());
      const pub = Number.isNaN(dt.getTime()) ? new Date().toUTCString() : dt.toUTCString();
      const desc = clean(a.summary || a.content || "").slice(0, 500);
      const img = clean(a.cover_image || "");
      return `    <item>\n      <title>${esc(a.title || "唐人日报新闻")}</title>\n      <link>${esc(link)}</link>\n      <guid isPermaLink="true">${esc(link)}</guid>\n      <pubDate>${esc(pub)}</pubDate>\n      <category>${esc(a.category_name || "新闻")}</category>\n      <description>${esc(desc)}</description>${img ? `\n      <enclosure url="${esc(img)}" type="${mime(img)}" />` : ""}\n    </item>`;
    }).join("\n");
    const newest = feedItems[0];
    const bd = newest ? new Date(newest.published_at || newest.created_at || Date.now()) : new Date();
    const build = Number.isNaN(bd.getTime()) ? new Date().toUTCString() : bd.toUTCString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>唐人日报 Tang Ren Daily</title>\n    <link>${SITE}/</link>\n    <description>立足美国，服务华人，提供美国时政、移民、ICE执法、中国官场及华人社区新闻。</description>\n    <language>zh-cn</language>\n    <lastBuildDate>${build}</lastBuildDate>\n    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;
    return new Response(request.method === "HEAD" ? null : xml, { status: 200, headers: {
      "content-type": "application/rss+xml; charset=UTF-8", "cache-control": "public, max-age=30, stale-while-revalidate=60",
      "x-trrb-feed": "live-supabase-v6-paged-public-only", "x-trrb-feed-count": String(feedItems.length),
      "x-trrb-feed-source-rows": String(scanned), "x-trrb-feed-pages": String(pages),
    } });
  } catch (e) {
    console.error("live feed failed", e);
    return context.next();
  }
};
