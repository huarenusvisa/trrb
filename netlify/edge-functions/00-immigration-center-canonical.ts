import { immigrationCategory, immigrationTopic } from "./_shared/immigration-knowledge-routes.ts";

const SITE = "https://trrb.net";

export const config = { path: ["/immigrate/center", "/immigrate/center.html"] };

function canonicalUrl(path: string, topic = "") {
  const url = new URL(`${SITE}/immigrate/center`);
  url.searchParams.set("path", path);
  if (topic) url.searchParams.set("topic", topic);
  return url.toString();
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  const requestedPath = String(url.searchParams.get("path") || "study").trim();
  const requestedTopic = String(url.searchParams.get("topic") || "").trim();
  const category = immigrationCategory(requestedPath);

  let target = "";
  if (!category) {
    target = canonicalUrl("study");
  } else if (requestedTopic && !immigrationTopic(category, requestedTopic)) {
    target = canonicalUrl(category.slug);
  } else if (url.pathname.endsWith(".html") || !url.searchParams.has("path")) {
    target = canonicalUrl(category.slug, requestedTopic);
  }

  if (!target) return context.next();

  const current = `${url.origin}${url.pathname}${url.search}`;
  if (current === target) return context.next();

  return new Response(null, {
    status: 301,
    headers: {
      location: target,
      "cache-control": "public, max-age=300",
      "x-trrb-immigration-canonical": "knowledge-center-v1"
    }
  });
};
