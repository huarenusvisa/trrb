const SITE_ORIGIN = "https://trrb.net";

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
  if (/^\/category\/hotnews(?:\/page\/\d+)?\/?$/i.test(pathname)) {
    return `${SITE_ORIGIN}/listing.html?category=${encodeURIComponent("热门头条")}`;
  }
  if (/^\/category\/[^/]+(?:\/page\/\d+)?\/?$/i.test(pathname)) return GONE;
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
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
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

async function fetchCandidates(title: string): Promise<Array<{ id: string; title: string }>> {
  const { base, key } = supabaseConfig();
  if (!base || !key) return [];

  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  const exact = new URL(`${base}/rest/v1/articles`);
  exact.searchParams.set("select", "id,title");
  exact.searchParams.set("status", "eq.published");
  exact.searchParams.set("title", `eq.${title}`);
  exact.searchParams.set("limit", "2");
  const exactResponse = await fetch(exact, { headers });
  if (exactResponse.ok) {
    const rows = await exactResponse.json();
    if (Array.isArray(rows) && rows.length) return rows;
  }

  const probes = Array.from(new Set([
    title.trim().slice(0, 24),
    title.trim().slice(0, 16),
    title.split(/[：:，,。!！?？—-]/)[0]?.trim().slice(0, 20) || ""
  ].filter((item) => item.length >= 6)));

  const collected = new Map<string, { id: string; title: string }>();
  for (const probeRaw of probes) {
    const probe = probeRaw.replace(/[\u0000-\u001f%*_(),]/g, " ").trim();
    if (probe.length < 6) continue;
    const fuzzy = new URL(`${base}/rest/v1/articles`);
    fuzzy.searchParams.set("select", "id,title");
    fuzzy.searchParams.set("status", "eq.published");
    fuzzy.searchParams.set("title", `ilike.*${probe}*`);
    fuzzy.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    fuzzy.searchParams.set("limit", "20");
    const response = await fetch(fuzzy, { headers });
    if (!response.ok) continue;
    const rows = await response.json();
    if (!Array.isArray(rows)) continue;
    rows.forEach((row) => row?.id && collected.set(String(row.id), row));
  }
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
      "Cache-Control": "public, max-age=300",
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

  // Canonical-domain migration: both .cc hosts must permanently consolidate into trrb.net.
  // Root and current application routes keep path/query exactly; legacy Chinese-title URLs
  // continue through the matcher below so they can land directly on the corresponding article.
  if (isCcHost && url.pathname === "/") {
    return redirect(`${SITE_ORIGIN}/${url.search}`, "cc-domain-migration-root");
  }

  if (url.searchParams.get("mailpoet_page") === "subscriptions") {
    return gone("wordpress-mailpoet-page");
  }

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
    if (!match?.id) return gone("wordpress-title-no-current-article");
    if (runnerUp && match.score < 90 && match.score - runnerUp.score < 8) {
      return gone("wordpress-title-ambiguous-retired");
    }

    return redirect(`${SITE_ORIGIN}/article.html?id=${encodeURIComponent(match.id)}`, `article-match-${match.score}`);
  } catch (error) {
    console.error("legacy redirect lookup failed", error);
    // On .cc, never serve a duplicate copy even if the article lookup backend is temporarily unavailable.
    if (isCcHost) return redirect(canonicalSamePath(url), "cc-domain-migration-fallback");
    return context.next();
  }
};
