#!/usr/bin/env node
import fs from 'node:fs';

const slug = String(process.argv[2] || process.env.CATEGORY_SLUG || '').trim().toLowerCase();
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const key = serviceKey || String(process.env.SUPABASE_ANON_KEY || '');
if (!slug) throw new Error('CATEGORY_SLUG is required');
if (!base || !key) throw new Error('Supabase environment is required for category pipeline gate');

const STANDARD_DEFAULTS = {
  ice: {
    name: 'ICE', slug: 'ice', sort_order: 10, is_active: true,
    show_in_navigation: true, show_on_homepage: true,
    auto_fetch: true, ai_rewrite: true, auto_publish: true,
    include_in_sitemap: true, include_in_google_news: true, include_in_rss: true,
    push_x: false, push_telegram: false,
    seo_title: 'ICE执法最新新闻｜唐人日报',
    seo_description: '追踪美国ICE执法、拘留、遣返及移民政策动态。',
    seo_keywords: 'ICE,美国移民执法,遣返,拘留',
    ai_prompt: '写成客观、写实的中文新闻，核实人物、地点、时间与执法机构；不得把指控写成定罪。'
  }
};

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

async function readCategory() {
  const url = new URL(`${base}/rest/v1/categories`);
  url.searchParams.set('select', 'slug,is_active,auto_fetch,ai_rewrite,auto_publish,push_x,push_telegram,ai_prompt');
  url.searchParams.set('slug', `ilike.${slug}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Category gate query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return (await response.json())?.[0] || null;
}

async function createMissingStandardCategory() {
  const defaults = STANDARD_DEFAULTS[slug];
  if (!defaults) return null;
  if (!serviceKey) throw new Error(`Category /${slug} does not exist and SUPABASE_SERVICE_ROLE_KEY is required for self-healing`);
  const response = await fetch(`${base}/rest/v1/categories`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(defaults)
  });
  if (!response.ok) throw new Error(`Failed to self-heal category /${slug}: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const created = (await response.json())?.[0] || null;
  console.log(`[category-gate] self-healed missing /${slug} category`);
  return created;
}

let row = await readCategory();
if (!row) {
  await createMissingStandardCategory();
  row = await readCategory();
}
if (!row) throw new Error(`Category /${slug} does not exist`);

const values = {
  enabled: Boolean(row.is_active),
  auto_fetch: Boolean(row.is_active && row.auto_fetch),
  ai_rewrite: Boolean(row.is_active && row.ai_rewrite),
  auto_publish: Boolean(row.is_active && row.auto_publish),
  push_x: Boolean(row.is_active && row.push_x),
  push_telegram: Boolean(row.is_active && row.push_telegram),
  ai_prompt: String(row.ai_prompt || '').replace(/[\r\n]+/g, ' ').trim()
};

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  fs.appendFileSync(outputFile, Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(''));
}
console.log(`[category-gate] /${slug}`, values);
