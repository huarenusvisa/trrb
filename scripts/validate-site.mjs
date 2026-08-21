import { readFile } from "node:fs/promises";

await import("./split-sitemap-index.mjs");

const failures = [];

async function text(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { failures.push(`${path}: missing (${error.code || error.message})`); return ""; }
}

async function bytes(path) {
  try { return await readFile(path); }
  catch (error) { failures.push(`${path}: missing (${error.code || error.message})`); return Buffer.alloc(0); }
}

function requireMatch(source, re, message) {
  if (!re.test(source)) failures.push(message);
}
function forbidMatch(source, re, message) {
  if (re.test(source)) failures.push(message);
}
async function parseBrowserScript(path) {
  const source = await text(path);
  if (!source) return;
  try { new Function(source); }
  catch (error) { failures.push(`${path}: JavaScript syntax error (${error.message})`); }
}

const index = await text("index.html");
requireMatch(index, /^\s*<!doctype html>/i, "index.html is not HTML");
requireMatch(index, /<link\s+rel=["']canonical["']\s+href=["']https:\/\/trrb\.net\/["']/i, "index.html missing canonical root");
requireMatch(index, /name=["']robots["'][^>]*content=["'][^"']*index,follow/i, "index.html missing index,follow");
requireMatch(index, /href=["']\/jobs\/?["'][^>]*>招聘求职<\/a>/i, "index.html missing 招聘求职 navigation");
requireMatch(index, /href=["']\/(?:immigration|immigrate\/?)["'][^>]*>移民美国<\/a>/i, "index.html missing 移民美国 navigation");
requireMatch(index, /articles-home\.js/i, "index.html missing homepage renderer");
requireMatch(index, /articles-home-live-fix\.js/i, "index.html missing live homepage guard");
requireMatch(index, /homepage-startup-stability\.js/i, "index.html missing startup stability guard");
requireMatch(index, /jobs-home\.js/i, "index.html missing jobs homepage loader");
forbidMatch(index, /当前暂无重点新闻/, "index.html contains retired false-empty hero copy");

const jobs = await text("jobs/index.html");
requireMatch(jobs, /^\s*<!doctype html>/i, "jobs/index.html is not HTML");
requireMatch(jobs, /name=["']robots["'][^>]*content=["'][^"']*index,follow/i, "jobs/index.html must be index,follow");
forbidMatch(jobs, /上线准备中/, "jobs/index.html still contains prelaunch disclosure");
requireMatch(jobs, /招聘与求职信息进入统一生产数据系统/, "jobs/index.html missing live-data disclosure");
requireMatch(jobs, /id=["']use-location["']/, "jobs/index.html missing current-location control");

const jobsHome = await text("jobs-home.js");
requireMatch(jobsHome, /TRRB_JOBS_HOME_PRELAUNCH\s*=\s*false/, "jobs-home.js is not production-live");
requireMatch(jobsHome, /public-home-jobs/, "jobs-home.js is not using dedicated live homepage jobs API");

const headers = await text("_headers");
requireMatch(headers, /Permissions-Policy:\s*camera=\(\),\s*microphone=\(\),\s*geolocation=\(self\)/i, "_headers blocks same-origin jobs geolocation");
requireMatch(headers, /\/\*\.js[\s\S]*?Cache-Control:\s*no-cache, no-store, must-revalidate/i, "_headers does not prevent stale JS");
requireMatch(headers, /\/\*\.css[\s\S]*?Cache-Control:\s*no-cache, no-store, must-revalidate/i, "_headers does not prevent stale CSS");

const netlify = await text("netlify.toml");
requireMatch(netlify, /node scripts\/write-deploy-version\.mjs/, "netlify.toml does not write exact deploy SHA");
requireMatch(netlify, /for = "\/\*\.js"[\s\S]*?no-cache, no-store, must-revalidate/, "netlify.toml reintroduces stale JS caching");
requireMatch(netlify, /for = "\/\*\.css"[\s\S]*?no-cache, no-store, must-revalidate/, "netlify.toml reintroduces stale CSS caching");

const focusCompat = await text("homepage-focus-v34.js");
requireMatch(focusCompat, /TRRB_HOME_FOCUS_COMPAT_SHIM/, "homepage-focus-v34.js is not the compatibility shim");
forbidMatch(focusCompat, /window\.renderHome\s*=/, "homepage-focus-v34.js still competes for renderHome ownership");

const liveFix = await text("articles-home-live-fix.js");
requireMatch(liveFix, /generalHeroFallback/, "articles-home-live-fix.js missing general hero fallback");
requireMatch(liveFix, /TRRB_refreshHomepageFocus/, "articles-home-live-fix.js missing live focus refresh export");
forbidMatch(liveFix, /当前暂无重点新闻/, "articles-home-live-fix.js can restore false-empty hero copy");

const trump = await text("trump/index.html");
requireMatch(trump, /data-seo-static-snapshot=["']build["']/, "trump/index.html missing crawlable static snapshot marker");
requireMatch(trump, /href=["']\/trump\/[^"']+/, "trump/index.html missing crawlable article fallback links");

const sitemap = await text("sitemap.xml");
requireMatch(sitemap, /^\s*<\?xml/i, "sitemap.xml is not XML");
requireMatch(sitemap, /<sitemapindex\b/i, "sitemap.xml is not a sitemap index after split");
forbidMatch(sitemap, /https:\/\/www\.trrb\.net\//i, "sitemap.xml contains www host");

const staticMap = await text("sitemap-static.xml");
requireMatch(staticMap, /<loc>https:\/\/trrb\.net\/<\/loc>/, "sitemap-static.xml missing root");
requireMatch(staticMap, /<loc>https:\/\/trrb\.net\/immigrate\/<\/loc>/, "sitemap-static.xml missing immigration hub");
requireMatch(staticMap, /<loc>https:\/\/trrb\.net\/legal\/<\/loc>/, "sitemap-static.xml missing legal hub");
forbidMatch(staticMap, /<loc>https:\/\/trrb\.net\/niulai\//, "sitemap-static.xml indexes niulai prelaunch");
forbidMatch(staticMap, /<loc>https:\/\/trrb\.net\/people\//, "sitemap-static.xml indexes retired people product");

const articleMap = await text("sitemap-articles-1.xml");
requireMatch(articleMap, /<urlset\b/i, "sitemap-articles-1.xml is not a URL set");
requireMatch(articleMap, /https:\/\/trrb\.net\/[^/<]+\/[^<]+/, "sitemap-articles-1.xml missing pretty article URLs");
forbidMatch(articleMap, /\/article\.html\?id=/i, "sitemap article chunk contains legacy article URLs");

const liveSitemap = await text("netlify/edge-functions/sitemap-live.ts");
requireMatch(liveSitemap, /jobsLoc\s*=\s*`\$\{SITE\}\/jobs\/`/, "live sitemap does not add launched jobs hub");
requireMatch(liveSitemap, /live-supabase-v7-jobs-indexable/, "live sitemap version is not jobs-indexable v7");

await Promise.all([
  "site-common.js", "site-search.js", "category-runtime-v3.js", "articles-home.js",
  "articles-home-live-fix.js", "homepage-focus-v34.js", "homepage-startup-stability.js",
  "homepage-immigration-hub.js", "jobs-home.js", "jobs/search.js", "jobs/unified-ui.js",
  "topic/trump/trump.js", "article-route-runtime.js"
].map(parseBrowserScript));

const manifest = await text("site.webmanifest");
try {
  const parsed = JSON.parse(manifest);
  if (parsed.start_url !== "/") failures.push("site.webmanifest start_url is not /");
  if (parsed.scope !== "/") failures.push("site.webmanifest scope is not /");
} catch { failures.push("site.webmanifest is invalid JSON"); }

const logo = await bytes("trrb-logo-cropped.webp");
if (logo.length && !(logo.subarray(0, 4).toString("ascii") === "RIFF" && logo.subarray(8, 12).toString("ascii") === "WEBP")) {
  failures.push("trrb-logo-cropped.webp is not WebP");
}

if (failures.length) {
  console.error(`Site validation failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  const isNetlify = process.env.NETLIFY === "true";
  if (!isNetlify) process.exit(1);
  console.warn("Netlify deploy will continue; strict validation remains enforced in GitHub Actions.");
}
console.log(failures.length ? "Site validation completed with non-blocking Netlify warnings." : "Site validation passed: current product invariants are consistent.");
