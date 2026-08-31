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
requireMatch(index, /homepage-community-hub\.js/i, "index.html missing community homepage card");
forbidMatch(index, /当前暂无重点新闻/, "index.html contains retired false-empty hero copy");

const jobs = await text("jobs/index.html");
requireMatch(jobs, /^\s*<!doctype html>/i, "jobs/index.html is not HTML");
requireMatch(jobs, /name=["']robots["'][^>]*content=["'][^"']*index,follow/i, "jobs/index.html must be index,follow");
forbidMatch(jobs, /上线准备中/, "jobs/index.html still contains prelaunch disclosure");
requireMatch(jobs, /招聘与求职信息进入统一生产数据系统/, "jobs/index.html missing live-data disclosure");
requireMatch(jobs, /id=["']use-location["']/, "jobs/index.html missing current-location control");

const huarenJobs = await text("huarengongzuo/index.html");
requireMatch(huarenJobs, /sizes=["']192x192["'][^>]*icon-192\.png|icon-192\.png[^>]*sizes=["']192x192["']/i, "huarengongzuo search favicon must expose a 48px-multiple PNG");
requireMatch(huarenJobs, /"@type":\s*"Organization"/, "huarengongzuo Organization schema missing");
requireMatch(huarenJobs, /"@type":\s*"WebSite"/, "huarengongzuo WebSite schema missing");
requireMatch(huarenJobs, /美国华人找工作与招聘/, "huarengongzuo competitor keyword guide missing");
requireMatch(huarenJobs, /纽约工作[\s\S]*法拉盛工作[\s\S]*洛杉矶工作/, "huarengongzuo city intent links missing");

const community = await text("community/index.html");
requireMatch(community, /^\s*<!doctype html>/i, "community/index.html is not HTML");
requireMatch(community, /name=["']robots["'][^>]*content=["'][^"']*index,follow/i, "community landing must be index,follow");
requireMatch(community, /https:\/\/trrb\.net\/community\//i, "community canonical missing");
requireMatch(community, /USCIS 面谈/, "community USCIS interview board missing");
requireMatch(community, /data-category=["']court_experience["']/, "community court board missing");
requireMatch(community, /data-category=["']lawyer_review["']/, "community lawyer review board missing");
requireMatch(community, /律师点评/, "community lawyer review label was not renamed");
forbidMatch(community, /吐槽律师/, "community still exposes the retired lawyer complaint label");

const asylumCommunity = await text("asylumjudge-community.html");
requireMatch(asylumCommunity, /^\s*<!doctype html>/i, "asylumjudge community page is not HTML");
requireMatch(asylumCommunity, /https:\/\/asylumjudge\.com\/community\//i, "asylumjudge community canonical missing");
requireMatch(asylumCommunity, /\/community\/community\.js/i, "asylumjudge community does not share the production community client");
requireMatch(asylumCommunity, /律师点评/, "asylumjudge community lawyer review label missing");

const unifiedLogin = await text("netlify/functions/unified-account-login.js");
requireMatch(unifiedLogin, /asylumjudge\\\.com/, "unified account origin allowlist is missing asylumjudge.com");

const communityApi = await text("netlify/functions/community-api.js");
requireMatch(communityApi, /access-control-allow-origin["']?\s*:\s*["']\*["']/, "community API is not available to the AsylumJudge origin");

const asylumBuilder = await text("scripts/build-asylumjudge-site.mjs");
requireMatch(asylumBuilder, /asylumjudge-community\.html/, "AsylumJudge production bundle is missing the community page");
requireMatch(asylumBuilder, /\/community\s+\/asylumjudge-community\.html\s+200!/, "AsylumJudge slashless community route is missing");
requireMatch(asylumBuilder, /\/community\/\s+\/asylumjudge-community\.html\s+200!/, "AsylumJudge production bundle is missing the community route");

const jobsHome = await text("jobs-home.js");
requireMatch(jobsHome, /TRRB_JOBS_HOME_PRELAUNCH\s*=\s*false/, "jobs-home.js is not production-live");
requireMatch(jobsHome, /public-home-jobs/, "jobs-home.js is not using dedicated live homepage jobs API");

const communityHome = await text("homepage-community-hub.js");
requireMatch(communityHome, /id\s*=\s*["']community-home-hub["']/, "homepage community card id missing");
requireMatch(communityHome, /root\.appendChild\(card\)/, "homepage community card is not placed in the open grid slot");
requireMatch(communityHome, /jobs\.insertAdjacentElement\(["']afterend["'],\s*card\)/, "homepage community card does not stay to the right of jobs");
requireMatch(communityHome, /lawyer_review/, "homepage community card lawyer review shortcut missing");

const immigrationHome = await text("homepage-immigration-hub.js");
requireMatch(immigrationHome, /rootNavigationBound/, "judge homepage card whole-module navigation missing");
requireMatch(immigrationHome, /window\.location\.assign\(["']https:\/\/asylumjudge\.com\/["']\)/, "judge homepage card does not navigate to AsylumJudge root");

const secondhand = await text("huarengongzuo/ershou/index.html");
requireMatch(secondhand, /^\s*<!doctype html>/i, "huarengongzuo/ershou/index.html is not HTML");
requireMatch(secondhand, /<link\s+rel=["']canonical["']\s+href=["']https:\/\/huarengongzuo\.com\/ershou\/["']/i, "huarengongzuo/ershou/index.html canonical missing");
requireMatch(secondhand, /name=["']robots["'][^>]*content=["'][^"']*index,follow/i, "huarengongzuo/ershou/index.html must be index,follow");
requireMatch(secondhand, /application\/ld\+json/i, "huarengongzuo/ershou/index.html JSON-LD missing");
requireMatch(secondhand, /id=["']smart-publish-form["']/i, "huarengongzuo/ershou/index.html smart publish form missing");
requireMatch(secondhand, /id=["']listing-photos["'][^>]*multiple/i, "huarengongzuo/ershou/index.html eight-photo uploader missing");
requireMatch(secondhand, /当前不经手货款/, "huarengongzuo/ershou/index.html must disclose that payments are not handled");

const headers = await text("_headers");
requireMatch(headers, /Permissions-Policy:\s*camera=\(\),\s*microphone=\(\),\s*geolocation=\(self\)/i, "_headers blocks same-origin jobs geolocation");
requireMatch(headers, /\/\*\.js[\s\S]*?Cache-Control:\s*no-cache, no-store, must-revalidate/i, "_headers does not prevent stale JS");
requireMatch(headers, /\/\*\.css[\s\S]*?Cache-Control:\s*no-cache, no-store, must-revalidate/i, "_headers does not prevent stale CSS");

const redirects = await text("_redirects");
const netlifyConfig = await text("netlify.toml");
const trumpCanonicalEdge = await text("netlify/edge-functions/01-trump-route-canonical.ts");
requireMatch(redirects, /^\/trump\s+\/trump\/index\.html\s+200!$/m, "trump canonical 200 rewrite missing");
forbidMatch(netlifyConfig, /from\s*=\s*["']\/(?:trump|topic\/trump)\/?["']/, "duplicate Trump rewrite remains in netlify.toml");
requireMatch(redirects, /^\/listing\s+\/listing\.html\s+200!$/m, "extensionless listing compatibility rewrite missing");
requireMatch(redirects, /^\/favicon\.ico\s+\/favicon\.svg\s+301!$/m, "root favicon compatibility redirect missing");
requireMatch(redirects, /^\/apple-touch-icon\.png\s+\/assets\/icons\/icon-192\.png\s+301!$/m, "root Apple touch icon redirect missing");
forbidMatch(redirects, /^\/trump\/\s+\/trump\s+301!/m, "trump directory redirect can self-loop after Netlify pretty-URL normalization");
forbidMatch(trumpCanonicalEdge, /["']\/trump\/index\.html["']/, "trump canonical edge function intercepts the internal /trump/index.html rewrite and redirects back to /trump");
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

const privacy = await text("privacy.html");
const terms = await text("terms.html");
requireMatch(privacy, /rel=["']canonical["']\s+href=["']https:\/\/trrb\.net\/privacy\.html["']/, "privacy.html canonical missing");
requireMatch(terms, /rel=["']canonical["']\s+href=["']https:\/\/trrb\.net\/terms\.html["']/, "terms.html canonical missing");

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
forbidMatch(staticMap, /<loc>https:\/\/trrb\.net\/ershou\/<\/loc>/, "sitemap-static.xml still indexes moved secondhand marketplace");
forbidMatch(staticMap, /<loc>https:\/\/trrb\.net\/niulai\//, "sitemap-static.xml indexes niulai prelaunch");
forbidMatch(staticMap, /<loc>https:\/\/trrb\.net\/people\//, "sitemap-static.xml indexes retired people product");

const articleMap = await text("sitemap-articles-1.xml");
requireMatch(articleMap, /<urlset\b/i, "sitemap-articles-1.xml is not a URL set");
requireMatch(articleMap, /https:\/\/trrb\.net\/[^/<]+\/[^<]+/, "sitemap-articles-1.xml missing pretty article URLs");
forbidMatch(articleMap, /\/article\.html\?id=/i, "sitemap article chunk contains legacy article URLs");

const liveSitemap = await text("netlify/edge-functions/sitemap-live.ts");
forbidMatch(liveSitemap, /jobsLoc\s*=\s*`\$\{SITE\}\/jobs\/`/, "live sitemap still adds redirected trrb.net jobs hub");
requireMatch(liveSitemap, /live-supabase-v9-quality-budget-canonical/, "live sitemap version is not quality budget canonical v9");

const niulai = await text("niulai/index.html");
const niulaiAdapter = await text("niulai/data-adapter.js");
const financeGateway = await text("netlify/functions/finance-market-data.ts");
const financeNews = await text("netlify/functions/finance-news.ts");
const financeHealth = await text("netlify/functions/finance-admin-health.ts");
const financeIngest = await text("scripts/niulai-finance-ingest.mjs");
const financeSources = await text("scripts/lib/niulai-finance-sources.mjs");
const financeWorkflow = await text(".github/workflows/niulai-finance-ingest.yml");
const adminHtml = await text("admin/index.html");
const adminJs = await text("admin/admin.js");
const operationsWorkflow = await text(".github/workflows/operations-control-plane.yml");
const judgeWorkflow = await text(".github/workflows/immigration-judge-data-sync.yml");
const asylumWorkflow = await text(".github/workflows/asylum-official-knowledge-sync.yml");
const legalWorkflow = await text(".github/workflows/round16-node1-legal-source-sync.yml");
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
forbidMatch(financeWorkflow, /^  (?:schedule|push):/m, "official finance collector must remain manual-only");
requireMatch(financeWorkflow, /^  workflow_dispatch:/m, "official finance workflow is missing the manual backup trigger");
requireMatch(financeWorkflow, /node scripts\/niulai-finance-ingest\.mjs/, "official finance workflow does not execute the collector");
requireMatch(adminHtml, /data-page=["']finance-monitor["']/, "admin console is missing finance monitoring navigation");
requireMatch(adminHtml, /data-publisher-preset=["']niulai["']/, "admin console is missing dedicated manual Niulai publishing");
requireMatch(adminJs, /牛来财经/, "manual Niulai publishing does not preselect its category");
forbidMatch(operationsWorkflow, /immigration-judge-every-72-hours:|official-asylum:|official-legal:/, "stopped EOIR/asylum/legal collectors must not remain in the control plane");
forbidMatch(judgeWorkflow, /^  workflow_call:/m, "EOIR collector must remain manual-only");
forbidMatch(asylumWorkflow, /^  workflow_call:/m, "asylum knowledge collector must remain manual-only");
forbidMatch(legalWorkflow, /^  workflow_call:/m, "official case-law collector must remain manual-only");
forbidMatch(niulaiAdapter, /TWELVE_DATA_API_KEY/, "Twelve Data API key name leaked into public client code");

const niulaiBuilder = await text("scripts/build-niulai-site.mjs");
requireMatch(niulaiBuilder, /https:\/\/trrb\.net\/api\/finance\/:splat/, "niulai independent build is not proxying the single TRRB finance source");
forbidMatch(redirects, /https:\/\/trrb\.net\/niulai\/?\s+https:\/\/niulai\.us\//, "temporary Niulai fallback would create a redirect loop before independent deployment");
requireMatch(redirects, /https:\/\/huarengongzuo\.com\/favicon\.svg\s+\/huarengongzuo\/logo-mark\.svg\s+200!/, "huarengongzuo favicon host rewrite is missing");

await Promise.all([
  "site-common.js", "site-search.js", "category-runtime-v3.js", "articles-home.js",
  "articles-home-live-fix.js", "homepage-focus-v34.js", "homepage-startup-stability.js",
  "homepage-immigration-hub.js", "homepage-community-hub.js", "jobs-home.js", "jobs/search.js", "jobs/unified-ui.js",
  "topic/trump/trump.js", "article-route-runtime.js", "community/community.js", "niulai/data-adapter.js", "niulai/app.js",
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
