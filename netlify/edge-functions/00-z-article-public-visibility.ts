const ARTICLE_SECTIONS = new Set([
  "ice",
  "trump",
  "important-news",
  "hot-headlines",
  "us-politics",
  "us-crime",
  "china-officialdom",
  "immigration",
  "asylum",
  "deport",
  "news"
]);

export const config = { path: ["/article.html", "/*/*"] };

function getSupabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}

function uuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function lookup(field: "id" | "slug", value: string) {
  const { base, key } = getSupabaseConfig();
  if (!base || !key) throw new Error("Supabase visibility config missing");
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", "id,slug,status,visibility");
  url.searchParams.set(field, `eq.${value}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { cache: "no-store", headers: headers(key) });
  if (!response.ok) throw new Error(`article visibility lookup ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function blocked(request: Request, status = 404) {
  const responseHeaders: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": status === 503 ? "no-store" : "public, max-age=300",
    "x-robots-tag": "noindex, nofollow",
    "x-trrb-article-visibility": status === 503 ? "lookup-unavailable" : "private-hidden"
  };
  if (status === 503) responseHeaders["retry-after"] = "120";
  return new Response(request.method === "HEAD" ? null : status === 503 ? "Temporarily unavailable" : "Not Found", {
    status,
    headers: responseHeaders
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);

  let field: "id" | "slug" | null = null;
  let value = "";

  if (url.pathname === "/article.html") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!uuid(id)) return context.next();
    field = "id";
    value = id;
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || !ARTICLE_SECTIONS.has(parts[0])) return context.next();
    if (parts[0] === "ice" && parts[1] === "news") return context.next();
    try { value = decodeURIComponent(parts[1]); } catch { value = parts[1]; }
    if (!value) return context.next();
    field = "slug";
  }

  try {
    const row = await lookup(field, value);
    if (!row) return context.next();
    if (String(row.visibility || "").trim() !== "public") return blocked(request, 404);
    return context.next();
  } catch (error) {
    console.error("article public visibility guard failed", error);
    return blocked(request, 503);
  }
};
