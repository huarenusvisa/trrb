#!/usr/bin/env node
import fs from 'node:fs';

const slug = String(process.argv[2] || process.env.CATEGORY_SLUG || '').trim().toLowerCase();
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!slug) throw new Error('CATEGORY_SLUG is required');
if (!base || !key) throw new Error('Supabase environment is required for category pipeline gate');

const url = new URL(`${base}/rest/v1/categories`);
url.searchParams.set('select', 'slug,is_active,auto_fetch,ai_rewrite,auto_publish,push_x,push_telegram,ai_prompt');
url.searchParams.set('slug', `eq.${slug}`);
url.searchParams.set('limit', '1');
const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
if (!response.ok) throw new Error(`Category gate query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
const row = (await response.json())?.[0];
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
  fs.appendFileSync(outputFile, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}
console.log(`[category-gate] /${slug}`, values);
