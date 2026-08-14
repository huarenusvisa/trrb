#!/usr/bin/env node

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

async function fetchAllPublished() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const u = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    u.searchParams.set('select', 'id,title,slug,status,published_at,created_at');
    u.searchParams.set('status', 'eq.published');
    u.searchParams.set('order', 'published_at.desc.nullslast,created_at.desc');
    u.searchParams.set('limit', '1000');
    u.searchParams.set('offset', String(offset));
    const r = await fetch(u, {headers});
    if (!r.ok) throw new Error(`articles fetch ${r.status}: ${(await r.text()).slice(0,300)}`);
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

async function patchSlug(id, slug) {
  const u = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  u.searchParams.set('id', `eq.${id}`);
  const r = await fetch(u, {
    method: 'PATCH',
    headers: {...headers, Prefer: 'return=representation'},
    body: JSON.stringify({slug})
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`patch ${id} ${r.status}: ${text.slice(0,300)}`);
  const rows = text ? JSON.parse(text) : [];
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].slug !== slug) {
    throw new Error(`patch verification failed for ${id}`);
  }
}

function idSuffix(id) {
  return String(id || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10) || 'article';
}

const articles = await fetchAllPublished();
const groups = new Map();
const used = new Set();
for (const a of articles) {
  const slug = String(a.slug || '').trim();
  if (!slug) continue;
  used.add(slug);
  if (!groups.has(slug)) groups.set(slug, []);
  groups.get(slug).push(a);
}
const duplicates = [...groups.entries()].filter(([, rows]) => rows.length > 1);
console.log(`published=${articles.length}; duplicate_groups=${duplicates.length}`);

let changed = 0;
for (const [base, rows] of duplicates) {
  // Query ordering keeps the newest published record first. Preserve that canonical URL.
  console.log(`duplicate ${base}: ${rows.map(r => r.id).join(', ')}`);
  for (const row of rows.slice(1)) {
    let candidate = `${base}-${idSuffix(row.id)}`;
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${idSuffix(row.id)}-${n++}`;
    await patchSlug(row.id, candidate);
    used.add(candidate);
    changed += 1;
    console.log(`repaired ${row.id}: ${base} -> ${candidate}`);
  }
}

const verify = await fetchAllPublished();
const counts = new Map();
for (const a of verify) {
  const slug = String(a.slug || '').trim();
  if (!slug) continue;
  counts.set(slug, (counts.get(slug) || 0) + 1);
}
const remaining = [...counts].filter(([, n]) => n > 1);
if (remaining.length) throw new Error(`duplicate slugs remain: ${remaining.slice(0,10).map(([s,n]) => `${s}:${n}`).join(' | ')}`);
console.log(`ROUND12 DUPLICATE SLUG REPAIR PASS: changed=${changed}; remaining=0`);
