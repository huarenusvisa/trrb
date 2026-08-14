#!/usr/bin/env node

const ORIGIN = 'https://trrb.net';
const ARTICLE_PATH = '/trump/%E7%89%B9%E6%9C%97%E6%99%AE%E5%8F%8D%E6%AD%A6%E5%99%A8%E5%8C%96%E5%9F%BA%E9%87%91%E7%BB%88%E7%BB%93%E5%B8%83%E5%85%B0%E5%A5%87%E5%AE%A3%E5%B8%83%E6%92%A4%E9%94%80%E9%A1%B9%E7%9B%AE%E5%8F%B8%E6%B3%95%E8%A1%A5%E5%81%BF%E6%88%98%E8%BD%AC%E5%90%91%E6%96%B0%E8%B7%AF%E5%BE%84-msre8bwa-ec3a13';
const ARTICLE_URL = `${ORIGIN}${ARTICLE_PATH}`;
const EXPECTED_STYLE_MARKER = '/styles.css?v=29.8-round10-hotfix';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

async function get(url) {
  return fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache'
    }
  });
}

const page = await get(ARTICLE_URL);
if (page.status !== 200) throw new Error(`article status ${page.status}: ${ARTICLE_URL}`);
const html = await page.text();
if (!html.includes(EXPECTED_STYLE_MARKER)) {
  throw new Error(`production article has not deployed Round 10 CSS marker: ${EXPECTED_STYLE_MARKER}`);
}
if (/\b(?:href|src)=["']\.\//i.test(html)) {
  throw new Error('pretty article still contains relative ./ asset/navigation paths');
}
if (!/src=["']\/trrb-logo-cropped\.webp["']/i.test(html)) {
  throw new Error('article logo is not root-relative');
}

const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
if (styles.length < 3) throw new Error(`expected at least 3 stylesheets, got ${styles.length}`);

for (const href of styles) {
  if (!(href.startsWith('/') || href.startsWith(`${ORIGIN}/`))) {
    throw new Error(`stylesheet is not root/absolute: ${href}`);
  }
  const url = new URL(href, ORIGIN).href;
  const response = await get(url);
  const type = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`stylesheet ${response.status}: ${url}`);
  if (!/^text\/css\b/i.test(type)) throw new Error(`stylesheet wrong content-type ${type || 'missing'}: ${url}`);
}

const coreCss = await (await get(`${ORIGIN}/styles.css?v=29.8-round10-hotfix`)).text();
if (!coreCss.includes('@media (max-width: 767px)')) throw new Error('mobile breakpoint missing from styles.css');
if (!coreCss.includes('.brand img')) throw new Error('brand image sizing rule missing from styles.css');
if (!coreCss.includes('.mobile-menu-toggle')) throw new Error('mobile navigation rules missing from styles.css');

console.log(`Round 10 mobile article regression PASS: ${ARTICLE_URL}`);
console.log(`stylesheets verified: ${styles.length}; all text/css; root-relative assets confirmed`);
