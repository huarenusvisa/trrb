#!/usr/bin/env node

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const TARGET = `${ORIGIN}/us-crime/%E7%99%BE%E4%B8%87%E5%B7%A5%E5%85%B7%E7%9B%97%E7%AA%83%E6%A1%88%E5%91%8A%E7%A0%B4%E5%8D%8E%E7%94%B7%E7%82%AE%E5%88%B6%E5%B9%BD%E7%81%B5%E8%AE%A2%E5%8D%95%E7%9B%97%E8%B5%B0140%E4%B8%87%E7%BE%8E%E5%85%83%E8%8E%B7%E5%88%915%E5%B9%B4-msrgiw56-5a39d3`;

const headers = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  'accept': 'text/html,application/xhtml+xml'
};

const manual = await fetch(TARGET, { headers, redirect: 'manual' });
const location = manual.headers.get('location') || '';
console.log(`stale-route initial: ${manual.status} ${location}`);

const response = await fetch(TARGET, { headers, redirect: 'follow' });
const html = await response.text();
console.log(`stale-route final: ${response.status} ${response.url}`);

const failures = [];
if (response.status !== 200) failures.push(`final status=${response.status}`);
if (new URL(response.url).hostname !== 'trrb.net') failures.push(`final host=${new URL(response.url).hostname}`);
if (/文章不存在|链接可能已经失效|文章已下线/i.test(html)) failures.push('rendered missing-article state');
if (!/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html)) failures.push('missing article h1');
if (!/data-prerendered=["']true["']|class=["'][^"']*article-body/i.test(html)) failures.push('article body not prerendered');

if (failures.length) {
  console.error(`Round 11 stale article route FAIL: ${failures.join('; ')}`);
  process.exit(1);
}

console.log('Round 11 stale article route PASS');
