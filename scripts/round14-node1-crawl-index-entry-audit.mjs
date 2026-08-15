const ORIGIN = (process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/$/, '');
const checks = [];
let failures = 0;

function check(ok, label, detail = '') {
  const row = { ok: Boolean(ok), label, detail };
  checks.push(row);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function request(pathOrUrl, ua = 'TRRB-Round14-Node1/1.0') {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${ORIGIN}${pathOrUrl}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': ua,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  return { url: res.url, status: res.status, headers: Object.fromEntries(res.headers.entries()), text: await res.text() };
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function canonical(html) {
  return (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
          html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) || [])[1] || '';
}

function hasNoindex(html, headers) {
  const meta = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
  const xrobots = headers['x-robots-tag'] || '';
  return /noindex/i.test(meta) || /noindex/i.test(xrobots);
}

const robots = await request('/robots.txt');
check(robots.status === 200, 'robots.txt HTTP 200', `status=${robots.status}`);
check(/Sitemap:\s*https:\/\/trrb\.net\/sitemap\.xml/i.test(robots.text), 'robots.txt 声明主 Sitemap');
check(/Sitemap:\s*https:\/\/trrb\.net\/news-sitemap\.xml/i.test(robots.text), 'robots.txt 声明 News Sitemap');
check(!/Disallow:\s*\/$/mi.test(robots.text), 'robots.txt 未误封整站');
check(/Disallow:\s*\/admin\//i.test(robots.text), 'robots.txt 屏蔽后台入口');

const sitemap = await request('/sitemap.xml?round14=node1');
const news = await request('/news-sitemap.xml?round14=node1');
check(sitemap.status === 200, '主 Sitemap HTTP 200', `status=${sitemap.status}`);
check(news.status === 200, 'News Sitemap HTTP 200', `status=${news.status}`);
check(/<urlset\b/i.test(sitemap.text), '主 Sitemap XML 根节点正确');
check(/<urlset\b/i.test(news.text) && /news:/i.test(news.text), 'News Sitemap Google News XML正确');

const all = locs(sitemap.text).filter((u) => u.startsWith(`${ORIGIN}/`));
check(all.length >= 100, '主 Sitemap 具备生产规模URL', `urls=${all.length}`);
check(!all.some((u) => /article\.html\?id=/i.test(u)), '主 Sitemap 无 legacy article?id URL');
check(!all.some((u) => /^https:\/\/www\.trrb\.net/i.test(u)), '主 Sitemap 无 www 重复主域');

const articleCandidates = all.filter((u) => /^https:\/\/trrb\.net\/[^/?#]+\/[^/?#]+/i.test(u));
const sample = articleCandidates.slice(-12);
check(sample.length >= 8, '取得可抓取文章样本', `sample=${sample.length}`);

const bots = [
  ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)']
];

for (const [name, ua] of bots) {
  let bad = 0;
  for (const url of sample) {
    const r = await request(`${url}${url.includes('?') ? '&' : '?'}r14bot=${name.toLowerCase()}`, ua);
    const c = canonical(r.text);
    const expected = url.replace(/\/$/, '');
    const got = c.replace(/\/$/, '');
    const ok = r.status === 200 && !hasNoindex(r.text, r.headers) && got === expected && /<title[^>]*>[^<]+<\/title>/i.test(r.text) && /<h1\b[^>]*>[^<]+<\/h1>/i.test(r.text);
    if (!ok) {
      bad += 1;
      console.log(`FAIL ${name} sample ${url} status=${r.status} canonical=${c || '-'} noindex=${hasNoindex(r.text, r.headers)}`);
    }
  }
  check(bad === 0, `${name} 抓取文章样本全部可索引`, `checked=${sample.length}; bad=${bad}`);
}

for (const path of ['/', '/important-news', '/hot-headlines', '/us-politics', '/trump', '/ice']) {
  const r = await request(`${path}${path.includes('?') ? '&' : '?'}r14=entry`, bots[0][1]);
  check(r.status === 200, `${path} Googlebot入口 HTTP 200`, `status=${r.status}`);
  check(!hasNoindex(r.text, r.headers), `${path} 未被意外 noindex`);
}

console.log(`ROUND14 NODE1 audit: checks=${checks.length}; failures=${failures}`);
if (failures === 0) {
  console.log('ROUND14 NODE1 PASS: search-engine crawl and index entry consistency verified');
} else {
  console.log('ROUND14 NODE1 FAIL: crawl/index entry inconsistencies detected');
  process.exitCode = 1;
}

await Bun?.write?.('round14-node1-crawl-index-entry-audit.json', JSON.stringify({ generatedAt: new Date().toISOString(), origin: ORIGIN, checks, failures }, null, 2)).catch?.(() => {});
