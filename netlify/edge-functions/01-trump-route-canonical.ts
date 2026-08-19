const CANONICAL = "https://trrb.net/trump";

export const config = {
  path: [
    "/trump/",
    "/trump/index.html",
    "/topic/trump",
    "/topic/trump/"
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
      "x-trrb-trump-canonical": "legacy-topic-to-trump-v1"
    }
  });
};
