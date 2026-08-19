const SITE = "https://trrb.net";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function fetchText(url, init = {}, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "manual", ...init });
      return { res, text: await res.text() };
    } catch (e) {
      lastError = e;
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastError;
}

async function redirectChain(source, maxHops = 4) {
  const chain = [];
  let current = source;
  for (let hop = 0; hop < maxHops; hop++) {
    const { res } = await fetchText(current, { headers: { "user-agent": UA } });
    const location = res.headers.get("location") || "";
    chain.push({ url: current, status: res.status, location });
    if (![301, 302, 307, 308].includes(res.status) || !location) break;
    current = new URL(location, current).href;
  }
  return chain;
}

function isArticleUrl(loc) {
  if (/article\.html\?id=/i.test(loc)) return true;
  try {
    const url = new URL(loc);
    if (url.hostname !== "trrb.net" && url.hostname !== "www.trrb.net") return false;
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    if (parts.length !== 2) return false;
    const [section, slug] = parts;
    if (!slug || (section === "ice" && slug === "news")) return false;
    return new Set([
      "ice", "trump", "important-news", "hot-headlines", "us-politics", "us-crime",
      "china-officialdom", "immigration", "asylum", "deport", "news", "expose"
    ]).has(section);
  } catch {
    return false;
  }
}

async function collectArticles() {
  const queue = [`${SITE}/sitemap.xml`, `${SITE}/news-sitemap.xml`];
  const seen = new Set();
  const articles = [];
  while (queue.length && seen.size < 25 && articles.length < 20) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const { res, text } = await fetchText(url);
    if (!res.ok) continue;
    for (const loc of extractLocs(text)) {
      if (isArticleUrl(loc)) articles.push(loc.replace("https://www.trrb.net", SITE));
      else if (/sitemap.*\.xml/i.test(loc) && !seen.has(loc)) queue.push(loc);
      if (articles.length >= 20) break;
    }
  }
  return [...new Set(articles)].slice(0, 20);
}

function getMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`, "i"));
  return (a?.[1] || b?.[1] || "").trim();
}

function getCanonical(html) {
  return (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || "").trim();
}

function stripHtml(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function isIceUrl(value) {
  try { return new URL(value).pathname.startsWith("/ice/") && new URL(value).pathname !== "/ice/news"; }
  catch { return false; }
}

const report = { generated_at: new Date().toISOString(), host: {}, samples: [], failures: [] };

for (const source of ["http://trrb.net/", "http://www.trrb.net/", "https://www.trrb.net/"]) {
  try {
    const chain = await redirectChain(source);
    report.host[source] = chain;
    const first = chain[0];
    const last = chain[chain.length - 1];
    const finalUrl = last?.location ? new URL(last.location, last.url).href : last?.url || source;
    const permanentOnly = chain.slice(0, -1).every((x) => [301, 308].includes(x.status));
    const firstPermanent = [301, 308].includes(first?.status);
    if (!firstPermanent || !permanentOnly || !finalUrl.startsWith(SITE)) {
      report.failures.push(`bad host redirect chain: ${source} -> ${JSON.stringify(chain)}`);
    }
  } catch (e) {
    report.failures.push(`host check error ${source}: ${e.message}`);
  }
}

const articles = await collectArticles();
if (articles.length < 5) report.failures.push(`sitemap article sample too small: ${articles.length}`);

for (const url of articles) {
  try {
    const { res, text } = await fetchText(url, { headers: { "user-agent": UA } });
    const title = stripHtml(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    const h1 = stripHtml(text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
    const description = getMeta(text, "description");
    const robots = getMeta(text, "robots");
    const canonical = getCanonical(text);
    const body = stripHtml(text.match(/<div class=["']article-body["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const hasSchema = /NewsArticle/.test(text);
    const ice = isIceUrl(url);
    const row = { url, status: res.status, title_length: title.length, h1_length: h1.length, description_length: description.length, canonical, robots, body_length: body.length, hasSchema, prerender: res.headers.get("x-trrb-prerender") || "" };
    report.samples.push(row);
    const bad = [];
    if (res.status !== 200) bad.push(`status ${res.status}`);
    if (!title || title.length < 8) bad.push("missing/short title");
    if (!h1 || h1.length < 4) bad.push("missing/short h1");
    if (!ice && description.length < 70) bad.push(`short description ${description.length}`);
    if (ice && description.length === 0) bad.push("missing ICE description");
    if (canonical !== url) bad.push(`canonical mismatch ${canonical}`);
    if (/noindex/i.test(robots)) bad.push("noindex");
    if (!ice && body.length < 80) bad.push(`thin prerendered body ${body.length}`);
    if (ice && body.length === 0) bad.push("empty ICE prerendered body");
    if (!hasSchema) bad.push("missing NewsArticle");
    if (!row.prerender) bad.push("missing prerender header");
    if (bad.length) report.failures.push({ url, bad });
  } catch (e) {
    report.failures.push({ url, bad: [`fetch error after retries ${e.message}`] });
  }
}

await import("node:fs/promises").then((fs) => fs.writeFile("google-indexing-acceptance-report.json", JSON.stringify(report, null, 2)));
console.log(JSON.stringify({ checked: report.samples.length, failures: report.failures.length, host: report.host }, null, 2));
if (report.failures.length) {
  console.error(JSON.stringify(report.failures.slice(0, 20), null, 2));
  process.exit(1);
}
