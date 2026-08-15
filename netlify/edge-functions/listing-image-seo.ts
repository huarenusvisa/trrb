export const config = { path: "/listing.js" };

export default async (_request: Request, context: any) => {
  const upstream = await context.next();
  if (!upstream.ok) return upstream;

  const contentType = upstream.headers.get("content-type") || "";
  if (!/javascript|text\/plain/i.test(contentType)) return upstream;

  let source = await upstream.text();
  const before = ' alt="" />';
  const after = ' alt="${escapeAttribute(article.title || article.category || "新闻图片")}" />';
  if (source.includes(before)) source = source.replaceAll(before, after);

  const headers = new Headers(upstream.headers);
  headers.delete("content-length");
  headers.set("x-trrb-image-seo", "listing-alt-v1");
  headers.set("cache-control", "public, max-age=300, stale-while-revalidate=3600");
  return new Response(source, { status: upstream.status, statusText: upstream.statusText, headers });
};
