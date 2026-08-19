const CANONICAL_HOST = "trrb.net";
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

// Inline Edge Functions that match the same request are processed alphabetically
// by file name. The 00- prefix makes this host guard run before article/category/
// sitemap/feed responders, so they cannot terminate the chain with a www 200.
export const config = { path: "/*" };

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const needsHostCanonical = host === `www.${CANONICAL_HOST}`;
  const needsHttps = url.protocol !== "https:";

  if (!needsHostCanonical && !needsHttps) return context.next();

  const destination = new URL(`${url.pathname}${url.search}`, CANONICAL_ORIGIN);
  return new Response(null, {
    status: 301,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "public, max-age=300",
      "X-TRRB-Host-Canonical": "apex-https"
    }
  });
};
