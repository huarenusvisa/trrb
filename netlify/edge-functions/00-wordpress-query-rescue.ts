const SITE_ORIGIN = "https://trrb.net";

// Runs after 00-host-canonical / 00-legacy-article-query-guard and before the
// general WordPress archive retirement Edge. It converts old root query URLs
// into the current article/search entry points instead of serving homepage 200.
export const config = { path: "/" };

function redirect(location: string, reason: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: location,
      "Cache-Control": "public, max-age=300",
      "X-TRRB-Redirect": reason
    }
  });
}

function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

function dbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}

function safeCanonical(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const target = new URL(raw, SITE_ORIGIN);
    if (target.origin !== SITE_ORIGIN) return "";
    if (target.pathname === "/article.html") return "";
    return target.toString();
  } catch {
    return "";
  }
}

async function fetchCanonicalByLegacyId(numericId: string): Promise<string> {
  const { base, key } = supabaseConfig();
  if (!base || !key) return "";

  for (const legacyId of [`wp-${numericId}`, numericId]) {
    const endpoint = new URL(`${base}/rest/v1/articles`);
    endpoint.searchParams.set("select", "canonical_url");
    endpoint.searchParams.set("legacy_id", `eq.${legacyId}`);
    endpoint.searchParams.set("status", "eq.published");
    endpoint.searchParams.set("limit", "1");

    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: dbHeaders(key)
      });
      if (!response.ok) return "";
      const rows = await response.json();
      const canonical = safeCanonical(Array.isArray(rows) ? rows[0]?.canonical_url : "");
      if (canonical) return canonical;
    } catch (error) {
      console.warn("wordpress root legacy lookup unavailable", error);
      return "";
    }
  }

  const aliasEndpoint = new URL(`${base}/rest/v1/articles`);
  aliasEndpoint.searchParams.set("select", "canonical_url");
  aliasEndpoint.searchParams.set("metadata->legacy_alias_ids", `cs.["wp-${numericId}"]`);
  aliasEndpoint.searchParams.set("status", "eq.published");
  aliasEndpoint.searchParams.set("limit", "1");
  try {
    const response = await fetch(aliasEndpoint, { cache: "no-store", headers: dbHeaders(key) });
    if (!response.ok) return "";
    const rows = await response.json();
    return safeCanonical(Array.isArray(rows) ? rows[0]?.canonical_url : "");
  } catch (error) {
    console.warn("wordpress root legacy alias lookup unavailable", error);
    return "";
  }

  return "";
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);

  const postId = String(url.searchParams.get("p") || url.searchParams.get("page_id") || "").trim();
  if (/^\d+$/.test(postId)) {
    // High-confidence migrated records go straight to their published canonical
    // URL. Missing canonical data or a database outage falls back to the guarded
    // article route, which preserves archives and returns real 404/410 responses.
    const canonical = await fetchCanonicalByLegacyId(postId);
    if (canonical) return redirect(canonical, "wordpress-root-post-id-to-canonical");
    return redirect(`${SITE_ORIGIN}/article.html?id=${encodeURIComponent(postId)}`, "wordpress-root-post-id-fallback");
  }

  const search = String(url.searchParams.get("s") || "").trim();
  if (search) {
    const target = new URL("/listing.html", SITE_ORIGIN);
    target.searchParams.set("q", search.slice(0, 200));
    return redirect(target.toString(), "wordpress-root-search");
  }

  return context.next();
};
