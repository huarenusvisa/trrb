export const config = {
  path: [
    "/jobs/search.html",
    "/jobs/publish.html",
    "/jobs/seeker.html",
    "/jobs/manage.html",
    "/jobs/contact.html",
    "/jobs/review.html"
  ]
};

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const upstream = await context.next();
  const headers = new Headers(upstream.headers);
  headers.set("x-robots-tag", "noindex, follow, noarchive");
  headers.set("x-trrb-jobs-indexability", "operational-noindex-v1");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
};
