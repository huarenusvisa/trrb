const SITE_ORIGIN = "https://trrb.net";
const FALLBACK_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const FALLBACK_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

export const config = { path: "/*" };

const SKIP_PREFIXES = [
  "/admin", "/assets", "/data", "/netlify", "/.netlify", "/topic", "/trump",
  "/ice", "/immigrate", "/asylum", "/listing", "/article", "/feed", "/sitemap",
  "/news-sitemap", "/robots", "/favicon", "/manifest", "/service-worker"
];

const GONE = "__TRRB_GONE__";

function normalizeTitle(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\-—_·•:：,，。.!！?？“”‘’'"()（）【】\[\]《》<>\/\\|]+/g, "")
    .toLowerCase();
}

const LEGACY_ARTICLE_MAP = new Map<string, string>([
  [normalizeTitle("44岁科州男子被控杀妻-遭重罪指控"), "f0fb17df-d940-4039-8a77-76316e4e11a1"]
]);

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

function matchScore(legacyTitle: string, currentTitle: string): number {
  const wanted = normalizeTitle(legacyTitle);
  const current = normalizeTitle(currentTitle);
  if (!wanted || !current) return 0;
  if (wanted === current) return 100;
  if (current.includes(wanted) || wanted.includes(current)) {
    const ratio = Math.min(wanted.length, current.length) / Math.max(wanted.length, current.length);
    return 80 + Math.round(ratio * 15);
  }
  const prefix = commonPrefixLength(wanted, current);
  const ratio = prefix / Math.min(wanted.length, current.length);
  return ratio >= 0.72 && prefix >= 10 ? Math.round(ratio * 75) : 0;
}

function legacySystemRedirect(pathname: string): string {
  // WordPress produced both /category/slug/page/2/ and /category/slug/0/
  // forms across older archive themes. The numeric form was previously missed,
  // leaving stale category archives eligible to keep returning through the site.
  if (/^\/category\/hotnews(?:\/(?:page\/)?\d+)?\/?$/i.test(pathname)) {
    return `${SITE_ORIGIN}/hot-headlines`;
  }
  if (/^\/category\/[^/]+(?:\/(?:page\/)?\d+)?\/?$/i.test(pathname)) return GONE;
  if (/^\/page\/\d+\/?$/i.test(pathname)) return GONE;
  if (/^\/(?:wp-admin|wp-login\.php|wp-json|xmlrpc\.php)(?:\/|$)/i.test(pathname)) return GONE;
  if (/^\/index\.php\/(?:author|page|category|tag)(?:\/|$)/i.test(pathname)) return GONE;
  return "";
}

function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function isLegacyCandidate(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  const decodedPath = decodePathname(pathname);
  const lower = decodedPath.toLowerCase();
  if (SKIP_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix + "/") || lower.startsWith(prefix + "."))) return false;
  if (/\.[a-z0-9]{1,8}$/i.test(decodedPath)) return false;
  const segments = decodedPath.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return /[\u3400-\u9fff]/u.test(decodedPath);
}

function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || FALLBACK_SUPABASE_URL).replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || FALLBACK_SUPABASE_KEY;
  return { base, key };
}

function safeCanonical(value: unknown): string {
  const canonical = String(value || "").trim();
  if (!canonical.startsWith(`${SITE_ORIGIN}/`)) return "";
  if (/\/article\.html\?id=/i.test(canonical)) return "";
  return canonical;
}

async function resolveLegacyWpArticle(url: URL): Promise<Response | null> {
  if (url.pathname !== "/article.html") return null;
  const legacyId = String(url.searchParams.get("id") || "").trim();
  if (!/^wp-\d+$/i.test(legacyId)) return null;

  const { base, key } = supabaseConfig();
  if (!base || !key) return temporaryUnavailable();

  try {
    const lookup = new URL(`${base}/rest/v1/articles`);
    lookup.searchParams.set("select", "id,canonical_url");
    lookup.searchParams.set("legacy_id", `eq.${legacyId}`);
    lookup.searchParams.set("status", "eq.published");
    lookup.searchParams.set("limit", "1");
    const response = await fetch(lookup, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`legacy id lookup failed ${response.status}`);
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return null;
    const canonical = safeCanonical(row.canonical_url);
    if (!canonical) throw new Error(`legacy id ${legacyId} has no valid canonical_url`);
    return redirect(canonical, "article-legacy-id-recovery");
  } catch (error) {
    console.error("legacy article id lookup failed", error);
    return temporaryUnavailable();
  }
}

async function isActiveCategorySlug(slug: string): Promise<boolean> {
  const { base, key } = supabaseConfig();
  if (!base || !key || !slug) return false;
  const url = new URL(`${base}/rest/v1/categories`);
  url.searchParams.set("select", "id");
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`category lookup failed ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

type ArticleCandidate = { id: string; title: string; canonical_url?: string };

async function fetchCandidates(title: string): Promise<ArticleCandidate[]> {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase config missing");

  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  const exact = new URL(`${base}/rest/v1/articles`);
  exact.searchParams.set("select", "id,title,canonical_url");
  exact.searchParams.set("status", "eq.published");
  exact.searchParams.set("title", `eq.${title}`);
  exact.searchParams.set("limit", "2");
  const exactResponse = await fetch(exact, { headers });
  if (!exactResponse.ok) throw new Error(`exact article lookup failed ${exactResponse.status}`);
  const exactRows = await exactResponse.json();
  if (Array.isArray(exactRows) && exactRows.length) return exactRows;

  const probes = Array.from(new Set([
    title.trim().slice(0, 24),
    title.trim().slice(0, 16),
    title.split(/[：:，,。!！?？—-]/)[0]?.trim().slice(0, 20) || ""
  ].filter((item) => item.length >= 6)));

  const collected = new Map<string, ArticleCandidate>();
  let successfulProbe = false;
  for (const probeRaw of probes) {
    const probe = probeRaw.replace(/[\u0000-\u001f%*_(),]/g, " ").trim();
    if (probe.length < 6) continue;
    const fuzzy = new URL(`${base}/rest/v1/articles`);
    fuzzy.searchParams.set("select", "id,title,canonical_url");
    fuzzy.searchParams.set("status", "eq.published");
    fuzzy.searchParams.set("title", `ilike.*${probe}*`);
    fuzzy.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    fuzzy.searchParams.set("limit", "20");
    const response = await fetch(fuzzy, { headers });
    if (!response.ok) continue;
    successfulProbe = true;
    const rows = await response.json();
    if (!Array.isArray(rows)) continue;
    rows.forEach((row) => row?.id && collected.set(String(row.id), row));
  }
  if (probes.length && !successfulProbe) throw new Error("all fuzzy article lookups failed");
  return [...collected.values()];
}

function redirect(destination: string, reason: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "X-TRRB-Redirect": reason
    }
  });
}

function canonicalSamePath(url: URL): string {
  return `${SITE_ORIGIN}${url.pathname}${url.search}`;
}

function gone(reason: string): Response {
  return new Response("Gone", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-TRRB-Retired": reason
    }
  });
}

function temporaryUnavailable(): Response {
  return new Response("Temporary legacy lookup failure", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "300",
      "X-TRRB-Legacy-Temporary": "lookup-unavailable"
    }
  });
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function retiredArticle(title: string, reason: string): Response {
  const safeTitle = escapeHtml(title || "这篇旧文章");
  const body = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} - 唐人日报</title>
<meta name="robots" content="noindex,nofollow">
<style>
  *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#202124;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:28px 18px 60px}.brand{font-size:28px;font-weight:800;color:#b3261e;margin:14px 0 36px}
  .card{background:#fff;border-radius:18px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.08)}h1{font-size:25px;line-height:1.45;margin:0 0 18px}
  p{font-size:16px;line-height:1.8;color:#5f6368}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.btn{display:inline-block;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700}
  .primary{background:#b3261e;color:#fff}.secondary{background:#eef0f3;color:#202124}.note{margin-top:24px;padding-top:20px;border-top:1px solid #eee;font-size:14px;color:#777}
</style>
</head>
<body><main class="wrap"><div class="brand">唐人日报 Tang Ren Daily</div><section class="card">
<h1>${safeTitle}</h1>
<p>这是一篇来自唐人日报旧版网站的历史链接。目前原始文章尚未完成迁移，因此该旧地址已停止收录。</p>
<div class="actions"><a class="btn primary" href="/">返回唐人日报首页</a><a class="btn secondary" href="/hot-headlines">查看中国热门头条</a><a class="btn secondary" href="/us-crime">查看美国警情</a></div>
<div class="note">如果该文章已经恢复，旧网址会自动跳转到恢复后的新闻页面。</div>
</section></main></body></html>`;

  return new Response(body, {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-TRRB-Retired": reason
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const isCcHost = host === "trrb.cc" || host === "www.trrb.cc";

  if (isCcHost && url.pathname === "/") {
    return redirect(`${SITE_ORIGIN}/${url.search}`, "cc-domain-migration-root");
  }

  if (url.searchParams.get("mailpoet_page") === "subscriptions") {
    return gone("wordpress-mailpoet-page");
  }

  if ((url.pathname === "/listing" || url.pathname === "/listing.html") && url.searchParams.get("category") === "中国官场") {
    return redirect(`${SITE_ORIGIN}/hot-headlines`, "retired-china-category");
  }

  const legacyWpArticle = await resolveLegacyWpArticle(url);
  if (legacyWpArticle) return legacyWpArticle;

  const systemDestination = legacySystemRedirect(url.pathname);
  if (systemDestination === GONE) return gone("wordpress-system-page");
  if (systemDestination) return redirect(systemDestination, "wordpress-system-page");

  const legacyCandidate = isLegacyCandidate(url.pathname);
  if (!legacyCandidate) {
    if (isCcHost) return redirect(canonicalSamePath(url), "cc-domain-migration-path");
    return context.next();
  }

  let legacyTitle = "";
  try {
    legacyTitle = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""))
      .replace(/\+/g, " ")
      .trim();
  } catch {
    return gone("wordpress-title-malformed");
  }

  if (legacyTitle.length < 4 || legacyTitle.length > 220) return gone("wordpress-title-invalid");

  const pinnedArticleId = LEGACY_ARTICLE_MAP.get(normalizeTitle(legacyTitle));
  if (pinnedArticleId) {
    return redirect(`${SITE_ORIGIN}/article.html?id=${encodeURIComponent(pinnedArticleId)}`, "article-pinned-recovery");
  }

  try {
    if (await isActiveCategorySlug(legacyTitle)) {
      if (isCcHost) return redirect(canonicalSamePath(url), "cc-active-category");
      return context.next();
    }

    const candidates = await fetchCandidates(legacyTitle);
    const ranked = candidates
      .map((row) => ({ ...row, score: matchScore(legacyTitle, row.title || "") }))
      .filter((row) => row.score >= 60)
      .sort((a, b) => b.score - a.score);

    const match = ranked[0];
    const runnerUp = ranked[1];
    if (!match?.id) return retiredArticle(legacyTitle, "wordpress-title-no-current-article");
    if (runnerUp && match.score < 90 && match.score - runnerUp.score < 8) {
      return retiredArticle(legacyTitle, "wordpress-title-ambiguous-retired");
    }

    const directCanonical = safeCanonical(match.canonical_url);
    return redirect(
      directCanonical || `${SITE_ORIGIN}/article.html?id=${encodeURIComponent(match.id)}`,
      directCanonical ? `article-direct-match-${match.score}` : `article-match-${match.score}`
    );
  } catch (error) {
    console.error("legacy redirect lookup failed", error);
    if (isCcHost) return redirect(canonicalSamePath(url), "cc-domain-migration-fallback");
    return temporaryUnavailable();
  }
};
