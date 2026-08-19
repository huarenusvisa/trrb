import categoryPrerender from "./category-prerender.ts";

// Netlify requires Edge Function config values to be statically analyzable.
// Keep the route list literal here so the existing category prerender handler
// is reliably mounted in production for every public news category route.
export const config = {
  path: [
    "/important-news",
    "/hot-headlines",
    "/us-politics",
    "/us-crime",
    "/china-officialdom",
    "/immigration",
    "/asylum",
    "/ice/news"
  ]
};

export default categoryPrerender;
