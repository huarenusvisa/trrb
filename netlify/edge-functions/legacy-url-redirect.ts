const SITE_ORIGIN = "https://www.trrb.net";

const SKIP_PREFIXES = [
  "/admin", "/assets", "/data", "/netlify", "/.netlify", "/topic", "/trump",
  "/ice", "/immigrate", "/asylum", "/listing", "/article", "/feed", "/sitemap",
  "/news-sitemap", "/robots", "/favicon", "/manifest", "/service-worker"
];

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\-—_·•:：,，。.!！?？“”‘’'"()（）【】\[\]《》<>\/\\|]+/g, "")
    .toLowerCase();
}

function isLegacyCandidate(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  const lower = pathname.toLowerCase();
  if (SKIP_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix + "/") || lower.startsWith(prefix + "."))) return false;
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) return false;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return /[\u3400-\u9fff]/u.test(pathname);
}

async function fetchCandidates(title: string): Promise<Array<{ id: string; title: string }>> {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!base || !key) return [];

  const exact = new URL(`${base}/rest/v1/articles`);
  exact.searchParams.set("select", "id,title");
  exact.searchParams.set("status", "eq.published");
  exact.searchParams.set("title", `eq.${title}`);
  exact.searchParams.set("limit", "2");

  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  const exactResponse = await fetch(exact, { headers });
  if (exactResponse.ok) {
    const rows = await exactResponse.json();
    if (Array.isArray(rows) && rows.length) return rows;
  }

  const probe = title.replace(/[\u0000-\u001f%*_(),]/g, " ").trim().slice(0, 28);
  if (probe.length < 6) return [];

  const fuzzy = new URL(`${base}/rest/v1/articles`);
  fuzzy.searchParams.set("select", "id,title");
  fuzzy.searchParams.set("status", "eq.published");
  fuzzy.searchParams.set("title", `ilike.*${probe}*`);
  fuzzy.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
  fuzzy.searchParams.set("limit", "10");

  const fuzzyResponse = await fetch(fuzzy, { headers });
  if (!fuzzyResponse.ok) return [];
  const rows = await fuzzyResponse.json();
  return Array.isArray(rows) ? rows : [];
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  if (!isLegacyCandidate(url.pathname)) return context.next();

  let legacyTitle = "";
  try {
    legacyTitle = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""))
      .replace(/\+/g, " ")
      .trim();
  } catch {
    return context.next();
  }

  if (legacyTitle.length < 4 || legacyTitle.length > 220) return context.next();

  try {
    const candidates = await fetchCandidates(legacyTitle);
    const wanted = normalizeTitle(legacyTitle);
    const match = candidates.find((row) => normalizeTitle(row.title || "") === wanted);

    if (!match?.id) return context.next();

    const destination = `${SITE_ORIGIN}/article.html?id=${encodeURIComponent(match.id)}`;
    return new Response(null, {
      status: 301,
      headers: {
        Location: destination,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-TRRB-Legacy-Redirect": "matched"
      }
    });
  } catch (error) {
    console.error("legacy redirect lookup failed", error);
    return context.next();
  }
};
