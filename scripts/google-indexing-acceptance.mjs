const SITE = "https://trrb.net";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function fetchText(url, init = {}) {
  const res = await fetch(url, { redirect: "manual", ...init });
  return { res, text: await res.text() };
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
      if (/article\.html\?id=/i.test(loc)) articles.push(loc);
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

const report = { generated_at: new Date().toISOString(), host: {}, samples: [], failures: [] };

for (const source of ["http://trrb.net/", "http://www.trrb.net/", "https://www.trrb.net/"]) {
  try {
    const { res } = await fetchText(source);
    const location = res.headers.get("location") || "";
    report.host[source] = { status: res.status, location };
    if (![301, 308].includes(res.status) || !location.startsWith(SITE)) report.failures.push(`bad host redirect: ${source} -> ${res.status} ${location}`);
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
    const row = { url, status: res.status, title_length: title.length, h1_length: h1.length, description_length: description.length, canonical, robots, body_length: body.length, hasSchema, prerender: res.headers.get("x-trrb-prerender") || "" };
    report.samples.push(row);
    const bad = [];
    if (res.status !== 200) bad.push(`status ${res.status}`);
    if (!title || title.length < 8) bad.push("missing/short title");
    if (!h1 || h1.length < 4) bad.push("missing/short h1");
    if (description.length < 70) bad.push(`short description ${description.length}`);
    if (canonical !== url) bad.push(`canonical mismatch ${canonical}`);
    if (/noindex/i.test(robots)) bad.push("noindex");
    if (body.length < 120) bad.push(`thin prerendered body ${body.length}`);
    if (!hasSchema) bad.push("missing NewsArticle");
    if (!row.prerender) bad.push("missing prerender header");
    if (bad.length) report.failures.push({ url, bad });
  } catch (e) {
    report.failures.push({ url, bad: [`fetch error ${e.message}`] });
  }
}

await import("node:fs/promises").then((fs) => fs.writeFile("google-indexing-acceptance-report.json", JSON.stringify(report, null, 2)));
console.log(JSON.stringify({ checked: report.samples.length, failures: report.failures.length, host: report.host }, null, 2));
if (report.failures.length) {
  console.error(JSON.stringify(report.failures.slice(0, 20), null, 2));
  process.exit(1);
}
