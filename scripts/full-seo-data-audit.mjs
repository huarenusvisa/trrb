#!/usr/bin/env node
import fs from 'node:fs';

const SITE = 'https://trrb.net';
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!base || !key) throw new Error('Supabase credentials are required');

const clean = (value = '') => String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const pathOnly = (value = '') => {
  try { return decodeURIComponent(new URL(value, SITE).pathname).replace(/\/+$/, '') || '/'; }
  catch { return ''; }
};
const legacyArticlePath = (value = '') => {
  try {
    const url = new URL(value);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return '';
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    return path.split('/').filter(Boolean).length === 1 && /[\u3400-\u9fff]/u.test(path) ? path : '';
  } catch { return ''; }
};

async function allRows(table, select, filters = {}) {
  const rows = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const url = new URL(`${base}/rest/v1/${table}`);
    url.searchParams.set('select', select);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('offset', String(offset));
    for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${table} query failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const [articles, redirects] = await Promise.all([
  allRows('articles', 'id,title,seo_title,summary,content,canonical_url,source_url,status,visibility,slug,category_name,topic_key,published_at,created_at', { status: 'eq.published', visibility: 'eq.public' }),
  allRows('url_redirects', 'old_path,new_path,article_id')
]);

const canonicalPaths = new Set(['/','/community','/immigrate','/legal','/important-news','/hot-headlines','/us-politics','/us-crime','/immigration','/asylum','/deport','/ice','/ice/news','/trump']);
const redirectPaths = new Set(redirects.map((row) => pathOnly(row.old_path)).filter(Boolean));
const duplicateCanonical = new Map();
const issues = { short_title: [], short_description: [], thin_body: [], invalid_canonical: [], missing_legacy_redirect: [], dead_internal_links: [] };
let indexable = 0;

for (const article of articles) {
  const title = clean(article.seo_title || article.title);
  const description = clean(article.summary || article.content).slice(0, 180);
  const body = clean(article.content || article.summary);
  const canonical = String(article.canonical_url || '').trim();
  const canonicalPath = pathOnly(canonical);
  if (canonicalPath) canonicalPaths.add(canonicalPath);
  if (title.length < 8) issues.short_title.push(article.id);
  if (description.length < 50) issues.short_description.push(article.id);
  if (body.length < 300) issues.thin_body.push(article.id);
  if (title.length >= 8 && body.length >= 300) indexable += 1;
  if (canonical && (!canonical.startsWith(`${SITE}/`) || /article\.html\?id=/i.test(canonical))) issues.invalid_canonical.push({ id: article.id, canonical });
  if (canonicalPath) duplicateCanonical.set(canonicalPath, [...(duplicateCanonical.get(canonicalPath) || []), article.id]);
  const oldPath = legacyArticlePath(article.source_url);
  if (oldPath && !redirectPaths.has(oldPath)) issues.missing_legacy_redirect.push({ id: article.id, source_url: article.source_url });
}

for (const article of articles) {
  const html = String(article.content || '');
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((match) => match[1]);
  for (const href of links) {
    let url;
    try { url = new URL(href, SITE); } catch { continue; }
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) continue;
    const candidate = pathOnly(url.href);
    if (!candidate || canonicalPaths.has(candidate) || redirectPaths.has(candidate) || /\.[a-z0-9]{1,8}$/i.test(candidate)) continue;
    issues.dead_internal_links.push({ id: article.id, href, path: candidate });
  }
}

const duplicate_canonical = [...duplicateCanonical.entries()].filter(([, ids]) => ids.length > 1).map(([canonical, ids]) => ({ canonical, ids }));
const report = {
  generated_at: new Date().toISOString(),
  scope: 'all public published Supabase articles',
  totals: { articles: articles.length, indexable, redirects: redirects.length },
  counts: Object.fromEntries(Object.entries(issues).map(([name, rows]) => [name, rows.length])),
  duplicate_canonical_count: duplicate_canonical.length,
  issues: Object.fromEntries(Object.entries(issues).map(([name, rows]) => [name, rows.slice(0, 500)])),
  duplicate_canonical: duplicate_canonical.slice(0, 500)
};

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/full-seo-data-latest.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ totals: report.totals, counts: report.counts, duplicate_canonical_count: report.duplicate_canonical_count }, null, 2));

if (issues.invalid_canonical.length || issues.missing_legacy_redirect.length || duplicate_canonical.length) {
  throw new Error('Full SEO data audit found canonical or legacy redirect integrity failures');
}
