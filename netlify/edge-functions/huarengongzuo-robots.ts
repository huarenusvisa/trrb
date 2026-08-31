const HOST = "huarengongzuo.com";

export const config = { path: "/robots.txt" };

export default (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  if (new URL(request.url).hostname.toLowerCase() !== HOST) return context.next();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /.netlify/",
    "Sitemap: https://huarengongzuo.com/sitemap.xml",
    ""
  ].join("\n");
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
      "x-hg-robots": "jobs-sitemap-v1"
    }
  });
};
