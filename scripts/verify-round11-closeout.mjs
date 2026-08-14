#!/usr/bin/env node

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const TARGET = `${ORIGIN}/us-crime/%E7%99%BE%E4%B8%87%E5%B7%A5%E5%85%B7%E7%9B%97%E7%AA%83%E6%A1%88%E5%91%8A%E7%A0%B4%E5%8D%8E%E7%94%B7%E7%82%AE%E5%88%B6%E5%B9%BD%E7%81%B5%E8%AE%A2%E5%8D%95%E7%9B%97%E8%B5%B0140%E4%B8%87%E7%BE%8E%E5%85%83%E8%8E%B7%E5%88%915%E5%B9%B4-msrgiw56-5a39d3`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const failures = [];

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function manual(url) {
  return fetchWithTimeout(url, { redirect: 'manual', headers: { 'user-agent': UA, 'cache-control': 'no-cache' } });
}

async function checkCanonicalHosts() {
  try {
    const httpsWww = await manual('https://www.trrb.net/');
    const httpsLocation = httpsWww.headers.get('location') || '';
    console.log(`host https://www.trrb.net/ -> ${httpsWww.status} ${httpsLocation}`);
    if (httpsWww.status !== 301 || httpsLocation !== `${ORIGIN}/`) {
      failures.push(`https://www.trrb.net/ not direct canonical: ${httpsWww.status} ${httpsLocation}`);
    }
  } catch (error) {
    failures.push(`https://www.trrb.net/ request failed: ${error.message || error}`);
  }

  try {
    const httpWww = await manual('http://www.trrb.net/');
    const firstLocation = httpWww.headers.get('location') || '';
    console.log(`host http://www.trrb.net/ -> ${httpWww.status} ${firstLocation}`);
    if (httpWww.status !== 301) {
      failures.push(`http://www.trrb.net/ status=${httpWww.status}`);
      return;
    }
    if (firstLocation === `${ORIGIN}/`) return;
    if (firstLocation !== 'https://www.trrb.net/') {
      failures.push(`http://www.trrb.net/ unexpected first hop: ${firstLocation}`);
      return;
    }
    const second = await manual(firstLocation);
    const secondLocation = second.headers.get('location') || '';
    console.log(`host ${firstLocation} -> ${second.status} ${secondLocation}`);
    if (second.status !== 301 || secondLocation !== `${ORIGIN}/`) {
      failures.push(`http://www canonical chain does not terminate at primary domain: ${second.status} ${secondLocation}`);
    }
  } catch (error) {
    failures.push(`http://www.trrb.net/ request failed: ${error.message || error}`);
  }
}

await checkCanonicalHosts();

for (const asset of ['/styles.css', '/site-common.js', '/article-v31.css', '/article-route-runtime.js']) {
  try {
    const r = await fetchWithTimeout(`${ORIGIN}${asset}`, { headers: { 'user-agent': UA, 'cache-control': 'no-cache' } });
    const cache = r.headers.get('cache-control') || '';
    const type = r.headers.get('content-type') || '';
    console.log(`asset ${asset}: ${r.status}; ${type}; cache=${cache}`);
    if (r.status !== 200) failures.push(`${asset} status=${r.status}`);
    if (!/text\/css|javascript/i.test(type)) failures.push(`${asset} MIME=${type}`);
    const match = cache.match(/max-age=(\d+)/i);
    if (!match || Number(match[1]) < 600) failures.push(`${asset} cache too short: ${cache}`);
  } catch (error) {
    failures.push(`${asset} request failed: ${error.message || error}`);
  }
}

try {
  const r = await fetchWithTimeout(TARGET, { headers: { 'user-agent': UA, 'cache-control': 'no-cache' }, redirect: 'follow' }, 15000);
  const html = await r.text();
  console.log(`article: ${r.status} ${r.url}`);
  if (r.status !== 200) failures.push(`article status=${r.status}`);
  if (/文章不存在|文章已下线|链接可能已经失效/i.test(html)) failures.push('article rendered missing state');
  if (!/BreadcrumbList/i.test(html)) failures.push('BreadcrumbList missing');
  if (!/["']@type["']\s*:\s*["']NewsArticle["']/i.test(html)) failures.push('NewsArticle missing');
  if (!/data-prerendered=["']true["']/i.test(html)) failures.push('server prerender missing');
} catch (error) {
  failures.push(`article request failed: ${error.message || error}`);
}

if (failures.length) {
  console.error(`Round 11 closeout FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Round 11 closeout verifier PASS');
