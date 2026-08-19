export const config = {
  path: [
    "/finance",
    "/finance/",
    "/finance/index.html",
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
