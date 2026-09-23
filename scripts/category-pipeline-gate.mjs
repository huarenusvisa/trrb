#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function canonicalCategorySlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return ({ ice: 'iceandpolice', china_hot: 'hot-headlines' })[slug] || slug;
}

export async function readCategoryGate(requestedSlug, { base, key, request = fetch }) {
  const slug = canonicalCategorySlug(requestedSlug);
  if (!slug) throw new Error('CATEGORY_SLUG is required');
  if (!base || !key) throw new Error('Supabase environment is required for category pipeline gate');
  const url = new URL(`${base.replace(/\/+$/, '')}/rest/v1/categories`);
  url.searchParams.set('select', 'slug,is_active,auto_fetch,ai_rewrite,auto_publish,push_x,push_telegram,ai_prompt');
  url.searchParams.set('slug', `eq.${slug}`);
  url.searchParams.set('limit', '1');
  const response = await request(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Category gate query failed: ${response.status}`);
  const row = (await response.json())?.[0];
  if (!row) throw new Error(`Category /${slug} does not exist`);
  // Reading a gate must never create legacy categories or override an editor's switches.
  return {
    enabled: Boolean(row.is_active),
    auto_fetch: Boolean(row.is_active && row.auto_fetch),
    ai_rewrite: Boolean(row.is_active && row.ai_rewrite),
    auto_publish: Boolean(row.is_active && row.auto_publish),
    push_x: Boolean(row.is_active && row.push_x),
    push_telegram: Boolean(row.is_active && row.push_telegram),
    ai_prompt: String(row.ai_prompt || '').replace(/[\r\n]+/g, ' ').trim()
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = canonicalCategorySlug(process.argv[2] || process.env.CATEGORY_SLUG);
  const values = await readCategoryGate(slug, {
    base: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(''));
  console.log(`[category-gate] /${slug}`, values);
}
