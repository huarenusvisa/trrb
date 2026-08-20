#!/usr/bin/env node
import fs from 'node:fs';

const SITE = 'https://trrb.net';
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ids = String(process.env.LEGACY_PRIORITY_IDS || 'wp-117123')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const report = {
  generated_at: new Date().toISOString(),
  site: SITE,
  samples: [],
  sitemaps: {},
  failures: []
};

async function fetchOne(url, redirect = 'manual') {
  try {
    const response = await fetch(url, {
      redirect,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml,text/xml,*/*',
        'cache-control': 'no-cache'
      }
    });
    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      url: response.url,
      location: response.headers.get('location') || '',
      xrobots: response.headers.get('x-robots-tag') || '',
      text
    };
  } catch (error) {
    return { ok: false, status: 0, url, location: '', xrobots: '', text: '', error: error?.message || String(error) };
  }
}

function visibleText(html = '') {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonical(html = '') {
  return (
    String(html).match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ||
    String(html).match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ||
    ''
  ).trim();
}

for (const id of ids) {
  const source = `${SITE}/article.html?id=${encodeURIComponent(id)}`;
  const first = await fetchOne(source, 'manual');
  const row = {
    id,
    source,
    source_status: first.status,
    location: first.location,
    final_status: 0,
    final_url: '',
    canonical: '',
    body_length: 0,
    noindex: false
  };

  if (![301, 308].includes(first.status) || !first.location) {
    report.failures.push({ id, problem: 'legacy URL did not permanently redirect', status: first.status, location: first.location, error: first.error || '' });
    report.samples.push(row);
    continue;
  }

  const target = new URL(first.location, source).href;
  if (!target.startsWith(`${SITE}/`) || /article\.html\?id=/i.test(target)) {
    report.failures.push({ id, problem: 'legacy URL redirected to invalid/noncanonical target', target });
    report.samples.push(row);
    continue;
  }

  const final = await fetchOne(target, 'follow');
  row.final_status = final.status;
  row.final_url = final.url;
  row.canonical = canonical(final.text);
  row.body_length = visibleText(final.text.match(/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] || '').length;
  row.noindex = /noindex/i.test(final.xrobots) || /name=["']robots["'][^>]+noindex/i.test(final.text);

  if (final.status !== 200) report.failures.push({ id, problem: 'canonical target did not return 200', status: final.status, target });
  if (row.canonical !== target) report.failures.push({ id, problem: 'canonical tag mismatch', expected: target, actual: row.canonical });
  if (row.body_length < 80) report.failures.push({ id, problem: 'restored article body too short/empty', body_length: row.body_length, target });
  if (row.noindex) report.failures.push({ id, problem: 'restored canonical is noindex', target });

  report.samples.push(row);
}

for (const path of ['/sitemap.xml', '/news-sitemap.xml']) {
  const url = `${SITE}${path}`;
  const response = await fetchOne(url, 'follow');
  const legacyQueryCount = (response.text.match(/article\.html\?id=/gi) || []).length;
  report.sitemaps[url] = { status: response.status, legacy_query_count: legacyQueryCount };
  if (response.status !== 200) report.failures.push({ url, problem: 'sitemap unavailable', status: response.status, error: response.error || '' });
  if (legacyQueryCount > 0) report.failures.push({ url, problem: 'legacy query URLs still exposed in sitemap', legacy_query_count: legacyQueryCount });
}

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/legacy-search-acceptance-latest.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
