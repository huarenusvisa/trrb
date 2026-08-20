import { readFile } from "node:fs/promises";

await import("./split-sitemap-index.mjs");

const failures = [];

async function bytes(path) {
  try { return await readFile(path); }
  catch (error) { failures.push(`${path}: missing (${error.code || error.message})`); return Buffer.alloc(0); }
}

function startsText(buffer, expected) {
  return buffer.toString("utf8", 0, Math.min(buffer.length, 300)).trimStart().startsWith(expected);
}

function includesText(buffer, expected) {
  return buffer.toString("utf8").includes(expected);
}

async function parseBrowserScript(path) {
  const source = (await bytes(path)).toString("utf8");
  if (!source) return;
  try { new Function(source); }
  catch (error) { failures.push(`${path}: JavaScript syntax error (${error.message})`); }
}

const index = await bytes("index.html");
const indexText = index.toString("utf8");
if (!startsText(index, "<!doctype html>")) failures.push("index.html is not HTML");
if (!includesText(index, "category-runtime-v3.js")) failures.push("index.html is missing category CMS runtime");
if (!includesText(index, "homepage-refresh-guard.js?v=20260819-bundle-supplements-2")) failures.push("index.html is missing current unified homepage refresh guard token");
if (!includesText(index, "articles-home.js?v=20260819-single-bundle-2")) failures.push("index.html is missing current unified homepage renderer token");
if (!includesText(index, "homepage-immigration-hub.js?v=20260819-reuse-bundle-2")) failures.push("index.html is missing current homepage hub bundle-reuse token");
if (!includesText(index, '<a href="/immigration">移民美国</a>')) failures.push("index.html primary immigration navigation is not canonical /immigration");
if (!/<a\s+href=["']\/jobs\/?["'][^>]*>招聘求职<\/a>/i.test(indexText)) failures.push("index.html is missing live 招聘求职 navigation");
if (!/jobs-home\.js/i.test(indexText)) failures.push("index.html is missing live jobs homepage loader");
if (!includesText(index, '<link rel="canonical" href="https://trrb.net/"')) failures.push("index.html is missing canonical https://trrb.net/");
if (!/name=["']robots["'][^>]*content=["'][^"']*index,follow/i.test(indexText)) failures.push("index.html is missing index,follow robots directive");
if (!includesText(index, 'property="og:title"')) failures.push("index.html is missing og:title");
if (!includesText(index, 'property="og:url" content="https://trrb.net/"')) failures.push("index.html og:url is not canonical root");
if (/href=["']\.\/expose\.html["']/i.test(indexText)) failures.push("index.html still emits legacy expose.html links");

const listing = await bytes("listing.html");
const listingText = listing.toString("utf8");
if (!startsText(listing, "<!doctype html>")) failures.push("listing.html is not HTML");
if (!includesText(listing, "category-runtime-v3.js?v=20260819-preserve-independent-nav-1")) failures.push("listing.html is missing current category runtime token");
if (!includesText(listing, "listing-seo.js?v=20260819-ssr-safe-3")) failures.push("listing.html is missing current SSR-safe category SEO runtime");
if (!includesText(listing, "immigration-entry.js?v=20260819-news-canonical-1")) failures.push("listing.html is missing immigration news canonical guard");
if (!includesText(listing, "article-route-runtime.js?v=20260819-seo-v5")) failures.push("listing.html is missing current article route runtime");
if (!includesText(listing, "nav-expose-link")) failures.push("listing.html is missing persistent expose navigation link");
if (!includesText(listing, '<base href="/"')) failures.push("listing.html is missing root base href for rewritten category routes");
if (!includesText(listing, '<a href="/immigration">移民美国</a>')) failures.push("listing.html immigration navigation is not canonical /immigration");
if (/\/index\.html#|\.\/expose\.html/i.test(listingText)) failures.push("listing.html still emits avoidable legacy internal redirects");

const article = await bytes("article.html");
const articleText = article.toString("utf8");
if (!startsText(article, "<!doctype html>")) failures.push("article.html is not HTML");
if (!includesText(article, "category-runtime-v3.js?v=20260819-preserve-independent-nav-1")) failures.push("article.html is missing current category runtime token");
if (!includesText(article, "article-route-runtime.js?v=20260819-seo-v5")) failures.push("article.html is missing current article route runtime");
if (!includesText(article, "nav-expose-link")) failures.push("article.html is missing persistent expose navigation link");
if (/\/index\.html#|\/expose\.html/i.test(articleText)) failures.push("article.html still emits avoidable legacy internal redirects");

const jobsHub = await bytes("jobs/index.html");
const jobsHubText = jobsHub.toString("utf8");
if (!startsText(jobsHub, "<!doctype html>")) failures.push("jobs/index.html is not HTML");
if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(jobsHubText)) failures.push("jobs production hub must not contain prelaunch noindex meta");
if (includesText(jobsHub, "上线准备中")) failures.push("jobs production hub still contains prelaunch disclosure");
if (!includesText(jobsHub, "招聘与求职信息进入统一生产数据系统")) failures.push("jobs production hub is missing live data disclosure");

const jobsHome = await bytes("jobs-home.js");
if (!includesText(jobsHome, "TRRB_JOBS_HOME_PRELAUNCH = false")) failures.push("jobs-home.js is not marked production-live");

const hostCanonical = await bytes("netlify/edge-functions/00-host-canonical.ts");
if (!includesText(hostCanonical, 'export const config = { path: "/*" }')) failures.push("00-host-canonical.ts does not cover all public paths");
if (!includesText(hostCanonical, 'www.${CANONICAL_HOST}')) failures.push("00-host-canonical.ts does not normalize the www host");
if (!includesText(hostCanonical, "status: 301")) failures.push("00-host-canonical.ts does not return a permanent redirect");
if (!includesText(hostCanonical, 'X-TRRB-Host-Canonical')) failures.push("00-host-canonical.ts is missing its production verification marker");

const immigrationCanonical = await bytes("netlify/edge-functions/00-immigration-center-canonical.ts");
if (!includesText(immigrationCanonical, 'path: ["/immigrate/center", "/immigrate/center.html"]')) failures.push("immigration center canonical guard is not bound to both legacy and clean routes");
if (!includesText(immigrationCanonical, "knowledge-center-v1")) failures.push("immigration center canonical guard is missing its production marker");
if (!includesText(immigrationCanonical, "status: 301")) failures.push("immigration center canonical guard does not permanently normalize invalid/legacy routes");

const seoRouteMeta = await bytes("netlify/edge-functions/seo-route-meta.ts");
if (!includesText(seoRouteMeta, '"移民美国": "immigration"')) failures.push("SEO route fallback still mixes immigration news with the knowledge center");
if (!includesText(seoRouteMeta, '"/immigration"')) failures.push("SEO route fallback does not cover /immigration");
if (!includesText(seoRouteMeta, 'robots: "noindex,follow,noarchive"')) failures.push("SEO route fallback no longer protects operational noindex pages");

const legalPrerender = await bytes("netlify/edge-functions/legal-detail-prerender.ts");
if (!includesText(legalPrerender, 'export const config = { path: "/legal/detail.html" }')) failures.push("legal detail Edge prerender is not bound to /legal/detail.html");
if (!includesText(legalPrerender, 'x-trrb-legal-detail-prerender')) failures.push("legal detail Edge prerender is missing its production marker");
if (!includesText(legalPrerender, 'analysisComplete')) failures.push("legal detail Edge prerender no longer gates incomplete analyses");
if (!includesText(legalPrerender, 'status: 200')) failures.push("legal detail Edge prerender has no valid-record 200 response");

const css = await bytes("styles.css");
const cssHead = css.toString("utf8", 0, Math.min(css.length, 300)).trimStart();
if (!(cssHead.startsWith(":root") || cssHead.startsWith("*") || cssHead.startsWith("body"))) failures.push("styles.css does not look like CSS");

const common = await bytes("site-common.js");
if (startsText(common, "{")) failures.push("site-common.js contains JSON instead of JavaScript");

const search = await bytes("site-search.js");
if (!includesText(search, "bindSiteSearch")) failures.push("site-search.js is missing search code");

const categoryRuntime = await bytes("category-runtime-v3.js");
if (!includesText(categoryRuntime, "show_in_navigation") || !includesText(categoryRuntime, "show_on_homepage")) failures.push("category runtime is not using canonical CMS fields");
if (!includesText(categoryRuntime, "a[data-dynamic-category]")) failures.push("category runtime no longer preserves independent static navigation entries");

await Promise.all([
  parseBrowserScript("site-common.js"), parseBrowserScript("site-search.js"), parseBrowserScript("category-runtime-v3.js"),
  parseBrowserScript("listing-seo.js"), parseBrowserScript("immigration-entry.js"), parseBrowserScript("listing.js"),
  parseBrowserScript("article.js"), parseBrowserScript("article-route-runtime.js"), parseBrowserScript("articles-home.js"),
  parseBrowserScript("homepage-refresh-guard.js"), parseBrowserScript("homepage-immigration-hub.js"), parseBrowserScript("articles-home-live-fix.js"),
  parseBrowserScript("topic-focus.js"), parseBrowserScript("ice-home-unify.js"), parseBrowserScript("legal/detail.js"),
  parseBrowserScript("jobs/listing.js"), parseBrowserScript("jobs-home.js"), parseBrowserScript("immigrate/center-link-canonical.js"),
  parseBrowserScript("admin/category-manager.js")
]);

const manifest = await bytes("site.webmanifest");
try {
  const parsed = JSON.parse(manifest.toString("utf8"));
  if (parsed.start_url !== "/") failures.push("site.webmanifest start_url is not canonical root /");
  if (parsed.scope !== "/") failures.push("site.webmanifest scope is not canonical root /");
} catch { failures.push("site.webmanifest is not valid JSON"); }

const logo = await bytes("trrb-logo-cropped.webp");
if (!(logo.subarray(0, 4).toString("ascii") === "RIFF" && logo.subarray(8, 12).toString("ascii") === "WEBP")) failures.push("trrb-logo-cropped.webp is not WebP");

const qr = await bytes("assets/reader-group-qr.jpeg");
if (!(qr[0] === 0xff && qr[1] === 0xd8 && qr[2] === 0xff)) failures.push("assets/reader-group-qr.jpeg is not JPEG");

const sitemap = await bytes("sitemap.xml");
if (!startsText(sitemap, "<?xml")) failures.push("sitemap.xml is not XML");
if (!includesText(sitemap, "<sitemapindex") || !includesText(sitemap, "<loc>https://trrb.net/sitemap-")) failures.push("sitemap.xml is not a valid canonical trrb.net sitemap index");
if (includesText(sitemap, "https://www.trrb.net/")) failures.push("sitemap.xml still contains www.trrb.net URLs");
if (!includesText(sitemap, "sitemap-articles-1.xml")) failures.push("sitemap.xml is missing article sitemap chunk");

const sitemapStatic = await bytes("sitemap-static.xml");
if (!includesText(sitemapStatic, "<urlset") || !includesText(sitemapStatic, "<loc>https://trrb.net/</loc>")) failures.push("sitemap-static.xml is missing canonical root URL");
if (!includesText(sitemapStatic, "<loc>https://trrb.net/immigrate/</loc>")) failures.push("sitemap-static.xml is missing immigration knowledge hub");
if (!includesText(sitemapStatic, "<loc>https://trrb.net/legal/</loc>")) failures.push("sitemap-static.xml is missing legal hub");
if (includesText(sitemapStatic, "<loc>https://trrb.net/finance/</loc>")) failures.push("sitemap-static.xml must not index finance demo preview");
if (includesText(sitemapStatic, "https://www.trrb.net/")) failures.push("sitemap-static.xml still contains www.trrb.net URLs");
if (!includesText(sitemapStatic, "<loc>https://trrb.net/immigrate/center?path=study</loc>")) failures.push("sitemap-static.xml is missing immigration knowledge category routes");
if (!includesText(sitemapStatic, "<loc>https://trrb.net/immigrate/center?path=study&amp;topic=f1</loc>")) failures.push("sitemap-static.xml is missing immigration knowledge topic routes");

const sitemapArticles = await bytes("sitemap-articles-1.xml");
const sitemapArticlesText = sitemapArticles.toString("utf8");
if (!includesText(sitemapArticles, "<urlset")) failures.push("sitemap-articles-1.xml is not a URL set");
if (!/https:\/\/trrb\.net\/[^/<]+\/[^<]+/.test(sitemapArticlesText)) failures.push("sitemap-articles-1.xml is missing pretty article URLs");
if (/\/article\.html\?id=/.test(sitemapArticlesText)) failures.push("sitemap-articles-1.xml still contains legacy article URLs");

const legalSitemap = await bytes("sitemap-legal.xml");
const legalSitemapText = legalSitemap.toString("utf8");
if (!startsText(legalSitemap, "<?xml")) failures.push("sitemap-legal.xml is not XML");
if (!includesText(legalSitemap, "<loc>https://trrb.net/legal/</loc>")) failures.push("sitemap-legal.xml is missing the legal hub");
if (!/https:\/\/trrb\.net\/legal\/detail\.html\?id=[^<]+/.test(legalSitemapText)) failures.push("sitemap-legal.xml is missing parameterized legal detail URLs");
if (includesText(legalSitemap, "https://www.trrb.net/")) failures.push("sitemap-legal.xml still contains www.trrb.net URLs");

const newsSitemap = await bytes("news-sitemap.xml");
if (!startsText(newsSitemap, "<?xml")) failures.push("news-sitemap.xml is not XML");
if (!includesText(newsSitemap, "xmlns:news=\"http://www.google.com/schemas/sitemap-news/0.9\"")) failures.push("news-sitemap.xml is missing Google News namespace");
if (includesText(newsSitemap, "https://www.trrb.net/")) failures.push("news-sitemap.xml still contains www.trrb.net URLs");
if (/\/article\.html\?id=/.test(newsSitemap.toString("utf8"))) failures.push("news-sitemap.xml still contains legacy article URLs");

const feed = await bytes("feed.xml");
if (!startsText(feed, "<?xml")) failures.push("feed.xml is not XML");
if (!includesText(feed, "<rss version=\"2.0\"") || !includesText(feed, "<channel>")) failures.push("feed.xml is not a valid RSS document");
if (/\/article\.html\?id=/.test(feed.toString("utf8"))) failures.push("feed.xml still contains legacy article URLs");

const redirects = await bytes("_redirects");
const redirectsText = redirects.toString("utf8");
if (!redirectsText.trim()) failures.push("_redirects contains no category routes");
for (const rule of [
  "http://trrb.net/* https://trrb.net/:splat 301!", "http://www.trrb.net/* https://trrb.net/:splat 301!", "https://www.trrb.net/* https://trrb.net/:splat 301!",
  "/index.html / 301!", "/politics /us-politics 301!", "/crime /us-crime 301!", "/china /china-officialdom 301!",
  "/uscis /immigration 301!", "/dhs /immigration 301!", "/cbp /immigration 301!", "/visa /immigration 301!", "/world /important-news 301!", "/immigration-us /immigration 301!"
]) {
  if (!redirectsText.includes(rule)) failures.push(`_redirects missing canonical rule: ${rule}`);
}

const headers = await bytes("_headers");
const headersText = headers.toString("utf8");
if (headers[0] === 0xff && headers[1] === 0xd8) failures.push("_headers was replaced by an image");
if (!includesText(headers, "Cache-Control")) failures.push("_headers is missing cache rules");
for (const route of ["/finance/", "/finance/*", "/expose", "/expose.html", "/thanks.html", "/delete-account.html"]) {
  if (!headersText.includes(`${route}\n  X-Robots-Tag: noindex, follow, noarchive`)) failures.push(`_headers missing noindex protection for ${route}`);
}

if (failures.length) {
  console.error("TRRB site integrity check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("TRRB production integrity check passed.");
