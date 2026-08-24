export const config = {
  path: [
    "/niulai",
    "/niulai/",
    "/niulai/*",
    "/expose",
    "/expose.html",
    "/thanks.html",
    "/delete-account.html",
    "/health.html"
  ]
};

const ROBOTS = "noindex,follow,noarchive";

function forceNoindexMeta(html: string): string {
  const meta = `<meta name="robots" content="${ROBOTS}">`;
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, meta);
  }
  return html.replace(/<\/head>/i, `${meta}</head>`);
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  // The /niulai path on trrb.net is a non-canonical product copy. The same
  // files are also the canonical niulai.us site, where they must stay
  // indexable and must not inherit the TRRB duplicate-route header.
  const forwardedHost = request.headers.get("x-forwarded-host") || "";
  const requestHost = request.headers.get("host") || "";
  const hostnames = [forwardedHost, requestHost, new URL(request.url).hostname]
    .flatMap((value) => value.toLowerCase().split(","))
    .map((value) => value.trim().replace(/:\d+$/, ""));
  if (hostnames.includes("niulai.us") || hostnames.includes("www.niulai.us")) {
    const upstream = await context.next();
    const headers = new Headers(upstream.headers);
    headers.delete("x-robots-tag");
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }

  const upstream = await context.next();
  const headers = new Headers(upstream.headers);
  headers.set("x-robots-tag", ROBOTS.replaceAll(",", ", "));
  headers.set("x-trrb-public-indexability", "nonindex-v2-html-aligned");

  if (request.method === "HEAD") {
    return new Response(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!/text\/html/i.test(contentType)) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  }

  const html = forceNoindexMeta(await upstream.text());
  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=UTF-8");
  return new Response(html, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
};
