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
requireMatch(index, /href=["']https:\/\/huarengongzuo\.com\/["'][^>]*>招聘求职<\/a>/i, "index.html missing direct 华人工作网 navigation");
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

const redirects = await text("_redirects");
requireMatch(redirects, /https:\/\/huarengongzuo\.com\/\s+q=:q\s+\/huarengongzuo\/index\.html\s+200!/i, "huarengongzuo query search rewrite missing");
requireMatch(redirects, /https:\/\/huarengongzuo\.com\/\s+sort=:sort\s+\/huarengongzuo\/index\.html\s+200!/i, "legacy jobs sort query rewrite missing");

const huarengongzuoRoot = await text("netlify/edge-functions/huarengongzuo-host-root.ts");
requireMatch(huarengongzuoRoot, /hostname\.toLowerCase\(\)\s*!==\s*["']huarengongzuo\.com["']/, "huarengongzuo root router is not host-scoped");
requireMatch(huarengongzuoRoot, /new URL\(["']\/huarengongzuo\/index\.html["']/, "huarengongzuo root router target missing");
requireMatch(huarengongzuoRoot, /path:\s*["']\/["']/, "huarengongzuo root router is not limited to the root path");

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
forbidMatch(liveSitemap, /jobsLoc\s*=\s*`\$\{SITE\}\/jobs\/`/, "live sitemap still adds redirected trrb.net jobs hub");
requireMatch(liveSitemap, /live-supabase-v8-jobs-external-canonical/, "live sitemap version is not jobs external canonical v8");

const niulai = await text("niulai/index.html");
const niulaiAdapter = await text("niulai/data-adapter.js");
const financeGateway = await text("netlify/functions/finance-market-data.ts");
const financeNews = await text("netlify/functions/finance-news.ts");
const financeHealth = await text("netlify/functions/finance-admin-health.ts");
const financeIngest = await text("scripts/niulai-finance-ingest.mjs");
const financeSources = await text("scripts/lib/niulai-finance-sources.mjs");
const financeWorkflow = await text(".github/workflows/niulai-finance-ingest.yml");
const adminHtml = await text("admin/index.html");
requireMatch(niulai, /搜索股票、ETF、基金/, "niulai search UI is missing");
requireMatch(niulai, /https:\/\/niulai\.us\//, "niulai canonical is not on its independent domain");
requireMatch(niulaiAdapter, /\/api\/finance\/search/, "niulai adapter is not connected to securities search gateway");
requireMatch(niulaiAdapter, /getSecurityWatchlist/, "niulai adapter is missing multi-market watchlist storage");
requireMatch(niulaiAdapter, /getAlertRules/, "niulai adapter is missing structured alert rules");
requireMatch(financeGateway, /TWELVE_DATA_API_KEY/, "finance gateway is not ready for the provider key");
requireMatch(financeGateway, /\/symbol_search/, "finance gateway is missing provider symbol search");
requireMatch(financeGateway, /\/time_series/, "finance gateway is missing provider time series");
requireMatch(financeNews, /public-articles/, "finance news endpoint is not synchronized with Tang Daily articles");
requireMatch(financeNews, /牛来财经/, "finance news endpoint is not prioritizing the Niulai finance category");
requireMatch(financeNews, /category_name[\s\S]{0,100}牛来财经/, "finance news endpoint can filter out official Niulai finance articles");
requireMatch(financeHealth, /authenticate\(req\)/, "finance admin health endpoint is not staff protected");
requireMatch(financeHealth, /niulai-finance-official-v1/, "finance admin health endpoint is not monitoring official ingestion");
requireMatch(financeSources, /press_monetary\.xml/, "official finance collector is missing the Federal Reserve feed");
requireMatch(financeSources, /sec\.gov\/news\/pressreleases\.rss/, "official finance collector is missing the SEC feed");
requireMatch(financeSources, /bls\.gov\/feed\/cpi\.rss/, "official finance collector is missing the BLS CPI feed");
requireMatch(financeIngest, /official_source_auto_published/, "official finance collector is not marking auto-published articles");
requireMatch(financeIngest, /source_url:\s*item\.url/, "official finance collector is not preserving source attribution");
requireMatch(financeIngest, /X_BEARER_TOKEN/, "official finance collector is not ready for the X API token");
requireMatch(financeWorkflow, /cron:\s*["']8,38 \* \* \* \*["']/, "official finance collector is not scheduled every 30 minutes");
requireMatch(financeWorkflow, /node scripts\/niulai-finance-ingest\.mjs/, "official finance workflow does not execute the collector");
requireMatch(adminHtml, /data-page=["']finance-monitor["']/, "admin console is missing finance monitoring navigation");
forbidMatch(niulaiAdapter, /TWELVE_DATA_API_KEY/, "Twelve Data API key name leaked into public client code");

const niulaiBuilder = await text("scripts/build-niulai-site.mjs");
requireMatch(niulaiBuilder, /https:\/\/trrb\.net\/api\/finance\/:splat/, "niulai independent build is not proxying the single TRRB finance source");
forbidMatch(redirects, /https:\/\/trrb\.net\/niulai\/?\s+https:\/\/niulai\.us\//, "temporary Niulai fallback would create a redirect loop before independent deployment");
requireMatch(redirects, /https:\/\/huarengongzuo\.com\/favicon\.svg\s+\/huarengongzuo\/logo-mark\.svg\s+200!/, "huarengongzuo favicon host rewrite is missing");

await Promise.all([
  "site-common.js", "site-search.js", "category-runtime-v3.js", "articles-home.js",
  "articles-home-live-fix.js", "homepage-focus-v34.js", "homepage-startup-stability.js",
  "homepage-immigration-hub.js", "jobs-home.js", "jobs/search.js", "jobs/unified-ui.js",
  "topic/trump/trump.js", "article-route-runtime.js", "niulai/data-adapter.js", "niulai/app.js",
  "niulai/stock.js", "niulai/fund.js", "niulai/detail-state-sync.js", "admin/finance-monitor.js"
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
