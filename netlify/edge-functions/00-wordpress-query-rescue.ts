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
      "Cache-Control": "no-store",
      "X-TRRB-Redirect": reason
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);

  const postId = String(url.searchParams.get("p") || url.searchParams.get("page_id") || "").trim();
  if (/^\d+$/.test(postId)) {
    return redirect(`${SITE_ORIGIN}/article.html?id=${encodeURIComponent(postId)}`, "wordpress-root-post-id");
  }

  const search = String(url.searchParams.get("s") || "").trim();
  if (search) {
    const target = new URL("/listing.html", SITE_ORIGIN);
    target.searchParams.set("q", search.slice(0, 200));
    return redirect(target.toString(), "wordpress-root-search");
  }

  return context.next();
};
