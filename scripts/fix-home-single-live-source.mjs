import fs from 'node:fs';

const homePath='articles-home.js';
const liveFixPath='articles-home-live-fix.js';
const indexPath='index.html';

let home=fs.readFileSync(homePath,'utf8');
let liveFix=fs.readFileSync(liveFixPath,'utf8');
let index=fs.readFileSync(indexPath,'utf8');

const fetchReplacement=`async function fetchLivePublishedArticles(limit = 60) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const url = \`/.netlify/functions/public-home-articles?limit=\${Math.min(Math.max(Number(limit)||60,20),200)}&_\${Date.now()}\`;
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(\`首页实时接口 \${response.status}\`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    return rows.map(mapLiveArticle).sort((a,b) => articleTimestamp(b) - articleTimestamp(a));
  } finally { clearTimeout(timer); }
}

function articleTimestamp(item) {
  const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

const HOME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
function isFreshHomepageArticle(item) {
  const t = articleTimestamp(item);
  return t > 0 && Date.now() - t <= HOME_MAX_AGE_MS;
}
`;

home=home.replace(/async function fetchLivePublishedArticles\([\s\S]*?\n}\n\nasync function fetchLiveArticleById/, fetchReplacement+'\nasync function fetchLiveArticleById');

home=home.replace(/async function loadHome\(\) \{[\s\S]*?\n}\n\nfunction articleUrl/, `async function loadHome() {
  try {
    const live = await fetchLivePublishedArticles(200);
    if (!live.length) throw new Error("首页实时接口没有返回已发布新闻");
    renderHome(live);
  } catch (error) {
    console.error("首页实时新闻加载失败：", error);
    const root = document.querySelector("#sections-grid");
    if (root) root.innerHTML = '<div class="empty-state">实时新闻暂时不可用，请稍后刷新。</div>';
  }
}

function articleUrl`);

home=home.replace(/const categoryArticles = articles\.filter\(\n    \(item\) => normalizeCategory\(item\.category\) === category\n  \);/, `const categoryArticles = articles
    .filter((item) => normalizeCategory(item.category) === category)
    .filter(isFreshHomepageArticle)
    .sort((a,b) => articleTimestamp(b) - articleTimestamp(a));`);

if(!home.includes('HOME_MAX_AGE_MS') || !home.includes('/.netlify/functions/public-home-articles')) throw new Error('articles-home.js patch failed');

liveFix=liveFix.replace(/function mergeFresh\(live, archived\) \{[\s\S]*?\n  \}/, `function mergeFresh(live) {
    return (Array.isArray(live) ? [...live] : []).sort((a,b) => articleTime(b) - articleTime(a));
  }`);
liveFix=liveFix.replace(/const archived = typeof window\.localArticleIndex[\s\S]*?const articles = mergeFresh\(live, Array\.isArray\(archived\) \? archived : \[\]\);/, 'const articles = mergeFresh(live);');
liveFix=liveFix.replace(/\/\/ articles-home\.js already performs the initial live load\.[\s\S]*?window\.setInterval\(refreshHome, REFRESH_INTERVAL\);/, `if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(refreshHome, 50), { once: true });
  } else {
    window.setTimeout(refreshHome, 50);
  }
  window.setInterval(refreshHome, REFRESH_INTERVAL);`);
if(liveFix.includes('mergeFresh(live,') || liveFix.includes('localArticleIndex')) throw new Error('live refresh archive merge removal failed');

index=index.replace(/<script src="\.\/articles-chunk-[^"]+"><\/script>/g,'');
index=index.replace(/<script src="\.\/articles-home-index\.js[^\"]*"><\/script>/g,'');
index=index.replace(/articles-home\.js\?v=[^"]+/g,'articles-home.js?v=20260816-single-source-1');
index=index.replace(/articles-home-live-fix\.js\?v=[^"]+/g,'articles-home-live-fix.js?v=20260816-single-source-1');

fs.writeFileSync(homePath,home);
fs.writeFileSync(liveFixPath,liveFix);
fs.writeFileSync(indexPath,index);
console.log('HOME_SINGLE_SOURCE_PATCHED=true');
console.log('HOME_ARCHIVE_SCRIPTS_REMOVED=true');
console.log('HOME_FRESHNESS_DAYS=14');
