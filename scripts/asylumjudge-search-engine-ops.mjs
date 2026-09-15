import fs from 'node:fs/promises';
import { google } from 'googleapis';
import { collectGoogleSearchPerformance } from './google-search-performance.mjs';
import { canonicalHref, hasNoindex } from './seo-live-page-policy.mjs';

const ORIGIN = 'https://asylumjudge.com';
let GSC_SITE_URL = process.env.ASYLUMJUDGE_GOOGLE_SEARCH_CONSOLE_SITE_URL || `${ORIGIN}/`;
const GSC_JSON = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || '';
const BING_KEY = process.env.BING_WEBMASTER_API_KEY || '';
const WRITE_MODE = /^(?:1|true|yes)$/i.test(process.env.SEO_WRITE_MODE || 'false');
const REQUIRE_GOOGLE = /^(?:1|true|yes)$/i.test(process.env.SEO_REQUIRE_GOOGLE || 'false');
const REQUIRE_BING = /^(?:1|true|yes)$/i.test(process.env.SEO_REQUIRE_BING || 'false');
const SITEMAP = `${ORIGIN}/sitemap.xml`;
const PRIORITY_PATHS = [
  '/',
  '/en/',
  '/courts/',
  '/en/courts/',
  '/tools/',
  '/en/tools/',
  '/asylum-judge-approval-rate/',
  '/en/asylum-judge-rating/',
  '/eoir-case-status/',
  '/en/eoir-case-status/',
  '/ice-detainee-locator/',
  '/en/ice-detainee-locator/',
  '/eoir-33-change-address/',
  '/en/eoir-33-change-address/',
  '/uscis-case-status/',
  '/en/uscis-case-status/',
  '/immigration-court-asylum-fee/',
  '/en/immigration-court-asylum-fee/'
];
const PRIORITY_URLS = PRIORITY_PATHS.map((path) => new URL(path, ORIGIN).href);
const report = {
  generated_at: new Date().toISOString(),
  site: ORIGIN,
  write_mode: WRITE_MODE,
  priority_urls: PRIORITY_URLS,
  local: {},
  google: { configured: false },
  bing: { configured: false },
  warnings: [],
  failures: []
};

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'AsylumJudge-Search-Engine-Ops/1.0', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30000)
  });
  return { response, text: await response.text() };
}

async function auditPriorityPages() {
  const rows = [];
  for (const url of PRIORITY_URLS) {
    try {
      const cacheBust = `${url}${url.includes('?') ? '&' : '?'}seo_update=${Date.now()}`;
      const { response, text } = await fetchText(cacheBust);
      const canonical = canonicalHref(text);
      const expected = new URL(url).href;
      const actualCanonical = canonical ? new URL(canonical, expected).href : '';
      const noindex = hasNoindex(text, Object.fromEntries(response.headers.entries()));
      const title = (text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
      const h1 = (text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
      const issues = [];
      if (response.status !== 200) issues.push(`HTTP ${response.status}`);
      if (!title) issues.push('missing title');
      if (!h1) issues.push('missing H1');
      if (noindex) issues.push('noindex');
      if (actualCanonical !== expected) issues.push(`canonical ${actualCanonical || 'missing'}`);
      rows.push({ url: expected, status: response.status, canonical: actualCanonical, noindex, title, h1, issues });
      for (const issue of issues) report.failures.push(`Priority URL ${expected}: ${issue}`);
    } catch (error) {
      rows.push({ url, status: 0, issues: [String(error?.message || error)] });
      report.failures.push(`Priority URL ${url}: ${String(error?.message || error)}`);
    }
  }
  report.local.priority_pages = rows;
}

async function googleOps() {
  if (!GSC_JSON) {
    report.google.reason = 'missing GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON';
    return;
  }
  let credentials;
  try {
    credentials = JSON.parse(GSC_JSON);
  } catch {
    report.failures.push('Google service account JSON is invalid');
    return;
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [WRITE_MODE ? 'https://www.googleapis.com/auth/webmasters' : 'https://www.googleapis.com/auth/webmasters.readonly']
  });
  const webmasters = google.webmasters({ version: 'v3', auth });
  const searchconsole = google.searchconsole({ version: 'v1', auth });
  report.google.configured = true;
  report.google.service_account_email = credentials.client_email || null;
  try {
    const siteInventory = await webmasters.sites.list();
    const availableSites = siteInventory.data.siteEntry || [];
    const requested = GSC_SITE_URL;
    const selected = availableSites.find((item) => item.siteUrl === requested)
      || availableSites.find((item) => item.siteUrl === 'sc-domain:asylumjudge.com')
      || availableSites.find((item) => {
        try { return new URL(item.siteUrl).hostname.replace(/^www\./, '') === 'asylumjudge.com'; }
        catch { return false; }
      });
    if (!selected?.siteUrl) {
      throw new Error(`No asylumjudge.com property is available to the service account; available properties: ${availableSites.map((item) => item.siteUrl).join(', ') || 'none'}`);
    }
    GSC_SITE_URL = selected.siteUrl;
    report.google.requested_site_url = requested;
    report.google.site_url = GSC_SITE_URL;
    report.google.available_sites = availableSites.map((item) => ({ site_url: item.siteUrl, permission_level: item.permissionLevel }));
    const site = await webmasters.sites.get({ siteUrl: GSC_SITE_URL });
    report.google.permission_level = site.data.permissionLevel || null;
    if (WRITE_MODE) {
      await webmasters.sitemaps.submit({ siteUrl: GSC_SITE_URL, feedpath: SITEMAP });
      report.google.sitemap_submitted = SITEMAP;
    }
    const sitemaps = await webmasters.sitemaps.list({ siteUrl: GSC_SITE_URL });
    report.google.sitemaps = (sitemaps.data.sitemap || []).map((item) => ({
      path: item.path,
      last_submitted: item.lastSubmitted,
      last_downloaded: item.lastDownloaded,
      pending: item.isPending,
      warnings: item.warnings,
      errors: item.errors
    }));
    report.google.performance_28d = await collectGoogleSearchPerformance({
      query: (params) => webmasters.searchanalytics.query(params),
      siteUrl: GSC_SITE_URL
    });
    report.google.url_inspection = [];
    for (const url of PRIORITY_URLS.slice(0, 12)) {
      try {
        const result = await searchconsole.urlInspection.index.inspect({
          requestBody: { inspectionUrl: url, siteUrl: GSC_SITE_URL, languageCode: 'zh-CN' }
        });
        const status = result.data.inspectionResult?.indexStatusResult || {};
        report.google.url_inspection.push({
          url,
          verdict: status.verdict,
          coverage_state: status.coverageState,
          indexing_state: status.indexingState,
          last_crawl_time: status.lastCrawlTime,
          page_fetch_state: status.pageFetchState,
          google_canonical: status.googleCanonical,
          user_canonical: status.userCanonical
        });
      } catch (error) {
        report.google.url_inspection.push({ url, error: String(error?.message || error) });
      }
    }
  } catch (error) {
    report.failures.push(`Google Search Console: ${String(error?.message || error)}`);
  }
}

async function bingCall(method, { body = null, query = {} } = {}) {
  const url = new URL(`https://ssl.bing.com/webmaster/api.svc/json/${method}`);
  url.searchParams.set('apikey', BING_KEY);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, body ? {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  } : undefined);
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${text.slice(0, 240)}`);
  try { return JSON.parse(text); } catch { return { text }; }
}

async function bingOps() {
  if (!BING_KEY) {
    report.bing.reason = 'missing BING_WEBMASTER_API_KEY';
    return;
  }
  report.bing.configured = true;
  try {
    report.bing.sites = (await bingCall('GetUserSites'))?.d || [];
    if (WRITE_MODE) {
      await bingCall('SubmitFeed', { body: { siteUrl: ORIGIN, feedUrl: SITEMAP } });
      report.bing.sitemap_submitted = SITEMAP;
    }
    const quotaResponse = await bingCall('GetUrlSubmissionQuota', { query: { siteUrl: ORIGIN } });
    const quota = quotaResponse?.d || quotaResponse || {};
    report.bing.url_submission_quota = quota;
    if (WRITE_MODE) {
      const available = Number(quota.DailyQuota ?? quota.dailyQuota);
      const limit = Number.isFinite(available) ? Math.max(0, Math.min(PRIORITY_URLS.length, available)) : PRIORITY_URLS.length;
      const urls = PRIORITY_URLS.slice(0, limit);
      if (urls.length) {
        await bingCall('SubmitUrlBatch', { body: { siteUrl: ORIGIN, urlList: urls } });
        report.bing.url_batch_submitted = urls;
      } else {
        report.warnings.push('Bing URL batch skipped because the reported daily quota is zero');
      }
    }
  } catch (error) {
    report.failures.push(`Bing Webmaster: ${String(error?.message || error)}`);
  }
}

await auditPriorityPages();
await googleOps();
await bingOps();
if (!report.google.configured) {
  const message = 'Google Search Console is not configured for AsylumJudge';
  (REQUIRE_GOOGLE ? report.failures : report.warnings).push(message);
}
if (!report.bing.configured) {
  const message = 'Bing Webmaster is not configured for AsylumJudge';
  (REQUIRE_BING ? report.failures : report.warnings).push(message);
}
await fs.writeFile('asylumjudge-search-engine-ops-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  site: report.site,
  write_mode: report.write_mode,
  priority_pages: report.local.priority_pages?.length || 0,
  google_configured: report.google.configured,
  google_sitemap_submitted: report.google.sitemap_submitted || null,
  bing_configured: report.bing.configured,
  bing_sitemap_submitted: report.bing.sitemap_submitted || null,
  bing_urls_submitted: report.bing.url_batch_submitted?.length || 0,
  warnings: report.warnings,
  failures: report.failures
}, null, 2));
if (report.failures.length) process.exitCode = 1;
