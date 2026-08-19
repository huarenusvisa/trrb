import { immigrationCategory, immigrationTopic } from "./_shared/immigration-knowledge-routes.ts";

const SITE = "https://trrb.net";

export const config = {
  path: [
    "/immigrate/center",
    "/immigrate/center.html"
  ]
};

function redirect(path: string, marker: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      location: `${SITE}${path}`,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "x-trrb-immigration-knowledge-canonical": marker
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const requestedPath = String(url.searchParams.get("path") || "").trim();
  const requestedTopic = String(url.searchParams.get("topic") || "").trim();

  if (!requestedPath) return redirect("/immigrate/", "missing-path-to-hub-v1");

  const category = immigrationCategory(requestedPath);
  if (!category) return redirect("/immigrate/", "invalid-path-to-hub-v1");

  if (requestedTopic && !immigrationTopic(category, requestedTopic)) {
    return redirect(`/immigrate/center?path=${encodeURIComponent(category.slug)}`, "invalid-topic-to-category-v1");
  }

  if (url.pathname.endsWith("/center.html")) {
    const topic = requestedTopic ? `&topic=${encodeURIComponent(requestedTopic)}` : "";
    return redirect(`/immigrate/center?path=${encodeURIComponent(category.slug)}${topic}`, "html-to-clean-center-v1");
  }

  return context.next();
};
