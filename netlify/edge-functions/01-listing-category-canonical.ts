const SITE = "https://trrb.net";

const CATEGORY_DESTINATIONS: Record<string, string> = {
  "重要新闻": "/important-news",
  "热门头条": "/hot-headlines",
  "美国时政": "/us-politics",
  "美国警情": "/us-crime",
  "中国官场": "/china-officialdom",
  "移民美国": "/immigration",
  "庇护百科": "/asylum",
  "ICE执法动态": "/ice/news",
  "ICE执法": "/ice/news",
  "驱逐快报": "/ice/news",
  "USCIS": "/immigration",
  "DHS": "/immigration",
  "CBP": "/immigration",
  "Visa": "/immigration",
  "Politics": "/us-politics",
  "China": "/china-officialdom",
  "World": "/important-news",
  "深度专题": "/important-news",
  "Trump": "/trump"
};

const RETIRED_PATHS: Record<string, string> = {
  "/uscis": "/immigration",
  "/dhs": "/immigration",
  "/cbp": "/immigration",
  "/visa": "/immigration",
  "/world": "/important-news",
  "/deep-dive": "/important-news",
  "/deportation": "/ice/news"
};

export const config = {
  path: [
    "/listing",
    "/listing.html",
    "/uscis", "/uscis/",
    "/dhs", "/dhs/",
    "/cbp", "/cbp/",
    "/visa", "/visa/",
    "/world", "/world/",
    "/deep-dive", "/deep-dive/",
    "/deportation", "/deportation/"
  ]
};

function redirect(destination: string, reason: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      location: `${SITE}${destination}`,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-trrb-category-canonical": reason
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  const retiredDestination = RETIRED_PATHS[pathname.toLowerCase()];
  if (retiredDestination) return redirect(retiredDestination, "inactive-category-to-active-hub-v1");

  if (pathname !== "/listing" && pathname !== "/listing.html") return context.next();
  if (url.searchParams.get("__trrb_category_template") === "1") return context.next();

  const query = String(url.searchParams.get("q") || "").trim();
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
  if (query || type === "search") return context.next();

  const category = String(url.searchParams.get("category") || "").trim();
  const destination = CATEGORY_DESTINATIONS[category];
  if (!destination) return context.next();

  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const withPage = page > 1 ? `${destination}?page=${page}` : destination;
  return redirect(withPage, "raw-listing-category-to-canonical-v1");
};
