// Retire WordPress archive/system routes that are not part of the current
// Tang Ren Daily information architecture. This runs after 00-host-canonical
// and 00-legacy-article-query-guard, but before article/category responders.
export const config = { path: "/*" };

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

function redirect(location: string, reason: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: new URL(location, "https://trrb.net").href,
      "Cache-Control": "public, max-age=300",
      "X-TRRB-Redirect": reason
    }
  });
}

function isWordPressArchive(pathname: string): boolean {
  // Year/month/day archive: /2024/, /2024/12/, /2024/12/31/
  if (/^\/20\d{2}(?:\/(?:0?[1-9]|1[0-2])(?:\/(?:0?[1-9]|[12]\d|3[01]))?)?\/?$/i.test(pathname)) return true;
  // Legacy pagination and taxonomy/author/search archives. These must be
  // handled before article-prerender interprets a trailing number as an ID.
  if (/^\/page\/\d+\/?$/i.test(pathname)) return true;
  if (/^\/category\/[^/]+(?:\/(?:page\/)?\d+)*(?:\/)?$/i.test(pathname)) return true;
  if (/^\/(?:tag|author|search)(?:\/|$)/i.test(pathname)) return true;
  // Old WordPress feed endpoints. Current RSS is /feed.xml and is untouched.
  if (/^\/feed\/?$/i.test(pathname)) return true;
  return false;
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  if (/^\/category\/hotnews(?:\/(?:page\/)?\d+)*\/?$/i.test(url.pathname)) {
    return redirect("/hot-headlines", "wordpress-hotnews-archive-canonical");
  }
  if (!isWordPressArchive(url.pathname)) return context.next();
  return gone("wordpress-archive-system-route");
};
