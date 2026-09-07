import fs from 'node:fs/promises';

const ORIGIN = (process.env.ASYLUMJUDGE_SITE_ORIGIN || 'https://asylumjudge.com').replace(/\/$/, '');
const SAMPLE_PER_SITEMAP = Math.max(3, Math.min(30, Number(process.env.ASYLUMJUDGE_SEO_SAMPLE_PER_SITEMAP || 8)));
const MAX_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.ASYLUMJUDGE_SEO_CONCURRENCY || 4)));
const TIMEOUT_MS = Math.max(5000, Math.min(60000, Number(process.env.ASYLUMJUDGE_SEO_TIMEOUT_MS || 20000)));
const CJK_WARNING_THRESHOLD = Math.max(20, Number(process.env.ASYLUMJUDGE_CJK_WARNING_THRESHOLD || 120));
const SITEMAPS = ['sitemap-static.xml', 'sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml'];
const LOCALE_PREFIXES = new Set(['en', 'es', 'fr', 'pt-br', 'hi', 'zh-hant', 'ru', 'ar', 'tr']);

const report = {
  generated_at: new Date().toISOString(),
  origin: ORIGIN,
  sitemap_urls: 0,
  sampled_urls: 0,
  failures: [],
  warnings: [],
  redirects: [],
  pages: []
};

function fail(message) { report.failures.push(message); }
function warn(message) { report.warnings.push(message); }
function locs(xml) { return [...String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&').trim()); }
function canonicalHref(html) {
  return (String(html || '').match(/<link\b[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*\bhref\s*=\s*["']([^"']+)/i)?.[1]
    || String(html || '').match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'][^"']*canonical/i)?.[1]
    || '').trim();
}
function hasNoindex(html, headers = {}) {
  return /noindex/i.test(headers['x-robots-tag'] || '')
    || /<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*\bcontent\s*=\s*["'][^"']*noindex/i.test(String(html || ''));
}
function visibleText(html) {
  return String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function cjkCount(html) { return (visibleText(html).match(/[\u3400-\u9fff]/g) || []).length; }
function localePrefix(url) {
  try {
    const first = new URL(url).pathname.split('/').filter(Boolean)[0]?.toLowerCase() || '';
    return LOCALE_PREFIXES.has(first) ? first : '';
  } catch { return ''; }
}
async function fetchResponse(url, redirect = 'follow') {
  const response = await fetch(url, {
    redirect,
    headers: { 'user-agent': 'TRRB-AsylumJudge-SEO-Robot/1.0', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  return {
    status: response.status,
    url: response.url,
    headers: Object.fromEntries(response.headers.entries()),
    text: await response.text()
  };
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  }));
  return out;
}
function expectedCanonical(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href;
}
function enforceSitemapUrl(url, sitemapName) {
  let parsed;
  try { parsed = new URL(url); } catch { fail(`${sitemapName}: invalid URL ${url}`); return; }
  if (parsed.origin !== ORIGIN) fail(`${sitemapName}: foreign origin ${url}`);
  if (parsed.search) fail(`${sitemapName}: query URL ${url}`);
  if (/\.html(?:$|\/)/i.test(parsed.pathname)) fail(`${sitemapName}: source HTML URL ${url}`);
  if (/^\/(?:judge|court)\/?$/i.test(parsed.pathname)) fail(`${sitemapName}: legacy compatibility shell ${url}`);
  if (/^\/(?:en|es|fr|pt-br|hi|zh-hant|ru|ar|tr)\/methodology\/?$/i.test(parsed.pathname)) fail(`${sitemapName}: untranslated localized methodology ${url}`);
}

async function auditSitemaps() {
  const index = await fetchResponse(`${ORIGIN}/sitemap.xml?seo_robot=${Date.now()}`);
  if (index.status !== 200) fail(`sitemap.xml HTTP ${index.status}`);
  for (const name of SITEMAPS) {
    if (!index.text.includes(`${ORIGIN}/${name}`)) fail(`sitemap.xml missing ${name}`);
  }

  const allUrls = [];
  const samples = [];
  for (const name of SITEMAPS) {
    const response = await fetchResponse(`${ORIGIN}/${name}?seo_robot=${Date.now()}`);
    if (response.status !== 200) {
      fail(`${name} HTTP ${response.status}`);
      continue;
    }
    const urls = locs(response.text);
    if (!urls.length) fail(`${name} contains no URLs`);
    for (const url of urls) enforceSitemapUrl(url, name);
    allUrls.push(...urls);

    const picks = [];
    if (urls.length) {
      for (let i = 0; i < Math.min(SAMPLE_PER_SITEMAP, urls.length); i += 1) {
        const index = Math.floor((i * (urls.length - 1)) / Math.max(1, SAMPLE_PER_SITEMAP - 1));
        picks.push(urls[index]);
      }
    }
    samples.push(...picks);
  }
  report.sitemap_urls = new Set(allUrls).size;
  return [...new Set(samples)];
}

async function auditPage(url) {
  try {
    const response = await fetchResponse(`${url}${url.includes('?') ? '&' : '?'}seo_robot=${Date.now()}`);
    const canonical = canonicalHref(response.text);
    const noindex = hasNoindex(response.text, response.headers);
    const issues = [];
    if (response.status !== 200) issues.push(`HTTP ${response.status}`);
    if (response.url.replace(/[?&]seo_robot=\d+/, '') !== url) issues.push(`unexpected final URL ${response.url}`);
    if (canonical !== expectedCanonical(url)) issues.push(`canonical ${canonical || 'missing'}`);
    if (noindex) issues.push('noindex');

    const prefix = localePrefix(url);
    const cjk = cjkCount(response.text);
    if (prefix && prefix !== 'zh-hant' && cjk > CJK_WARNING_THRESHOLD) {
      issues.push(`high CJK count ${cjk}`);
    }
    const row = { url, status: response.status, canonical, noindex, cjk, issues };
    report.pages.push(row);
    for (const issue of issues) fail(`${url}: ${issue}`);
    return row;
  } catch (error) {
    fail(`${url}: ${error.message}`);
    return { url, status: 0, issues: [error.message] };
  }
}

async function auditRedirect(source, expectedPath) {
  try {
    const response = await fetchResponse(`${ORIGIN}${source}`, 'manual');
    const location = response.headers.location || '';
    const resolved = location ? new URL(location, ORIGIN).href : '';
    const expected = `${ORIGIN}${expectedPath}`;
    report.redirects.push({ source, status: response.status, location: resolved, expected });
    if (![301, 308].includes(response.status)) fail(`${source}: expected permanent redirect, got HTTP ${response.status}`);
    if (resolved !== expected) fail(`${source}: expected ${expected}, got ${resolved || 'no location'}`);
  } catch (error) {
    fail(`${source}: ${error.message}`);
  }
}

const samples = await auditSitemaps();
report.sampled_urls = samples.length;
await mapLimit(samples, MAX_CONCURRENCY, auditPage);

await auditRedirect('/immigration-judge-approval-rate/index.html', '/');
await auditRedirect('/immigration-judge-approval-rate/china-dashboard.html', '/nationality/');
await auditRedirect('/china', '/nationalities/china--ch/');
await auditRedirect('/en/methodology/', '/methodology/');
await auditRedirect('/asylumjudge/index.html', '/');

await fs.writeFile('asylumjudge-live-seo-report.json', `${JSON.stringify(report, null, 2)}\n`);

console.log(`AsylumJudge live SEO robot: ${report.sitemap_urls} canonical sitemap URLs; ${report.sampled_urls} sampled pages; ${report.failures.length} failures; ${report.warnings.length} warnings.`);
if (report.failures.length) {
  console.error(report.failures.slice(0, 50).join('\n'));
  process.exitCode = 1;
}
