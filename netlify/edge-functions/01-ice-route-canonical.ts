const CANONICAL = "https://trrb.net/ice";

export const config = {
  // Do not match live-v6.html: /ice internally rewrites to that file.
  path: [
    "/ice/",
    "/topic/ice",
    "/topic/ice/",
    "/topic/ice/index.html"
  ]
};

export default async (request: Request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  return new Response(null, {
    status: 301,
    headers: {
      location: CANONICAL,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-trrb-ice-canonical": "legacy-topic-to-ice-v1"
    }
  });
};
