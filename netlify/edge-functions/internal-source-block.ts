export const config = { path: ["/scripts/*", "/netlify/edge-functions/*"] };

export default async () => new Response("Not Found", {
  status: 404,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow"
  }
});
