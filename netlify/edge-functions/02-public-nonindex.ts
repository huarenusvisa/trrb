export const config = {
  path: [
    "/finance",
    "/finance/",
    "/finance/index.html",
    "/expose",
    "/expose.html",
    "/thanks.html",
    "/delete-account.html"
  ]
};

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const upstream = await context.next();
  const headers = new Headers(upstream.headers);
  headers.set("x-robots-tag", "noindex, follow, noarchive");
  headers.set("x-trrb-public-indexability", "nonindex-v1");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
};
