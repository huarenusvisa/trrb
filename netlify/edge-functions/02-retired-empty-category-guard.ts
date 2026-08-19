const RETIRED_EMPTY_CATEGORY_PATHS = new Set([
  "/uscis",
  "/dhs",
  "/cbp",
  "/visa",
  "/world"
]);

export const config = {
  path: ["/uscis", "/dhs", "/cbp", "/visa", "/world"]
};

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (!RETIRED_EMPTY_CATEGORY_PATHS.has(path)) return context.next();

  return new Response(request.method === "HEAD" ? null : "Gone", {
    status: 410,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, nofollow",
      "x-trrb-retired-category": "inactive-empty-v1"
    }
  });
};
