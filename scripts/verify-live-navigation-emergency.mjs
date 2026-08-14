#!/usr/bin/env node

const ORIGIN = 'https://trrb.net';
const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' };
const webHeaders = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', accept: 'text/html,application/xhtml+xml' };

async function json(url) {
  const r = await fetch(url, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

const cats = await json(`${SUPABASE_URL}/rest/v1/categories?select=id,name,slug&is_active=eq.true`);
const byId = new Map(cats.map(x => [String(x.id), x]));
const byName = new Map(cats.map(x => [String(x.name || ''), x]));
const articles = await json(`${SUPABASE_URL}/rest/v1/articles?select=id,title,slug,category_id,category_name,topic_key,status&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=20`);

function section(a) {
  const topic = String(a.topic_key || '').toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  return byId.get(String(a.category_id || ''))?.slug || byName.get(String(a.category_name || ''))?.slug || 'news';
}

const failures = [];
for (const a of articles) {
  const legacy = `${ORIGIN}/article.html?id=${encodeURIComponent(a.id)}`;
  const pretty = `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(a.slug || a.id)}`;
  for (const [kind, url] of [['legacy', legacy], ['pretty', pretty]]) {
    try {
      const r = await fetch(url, { headers: webHeaders, redirect: 'follow' });
      const html = await r.text();
      const missing = /文章不存在|文章已删除|文章已下线|链接无效/i.test(html);
      const hasTitle = html.includes(String(a.title || '').replaceAll('&','&amp;').slice(0, 12)) || /<h1\b/i.test(html);
      console.log(`${kind} ${r.status} ${r.url} :: ${String(a.title || '').slice(0, 28)}`);
      if (r.status !== 200 || missing || !hasTitle) failures.push(`${kind}: ${a.id} status=${r.status} missing=${missing} h1=${hasTitle} final=${r.url}`);
    } catch (e) {
      failures.push(`${kind}: ${a.id} ${e.message}`);
    }
  }
}

console.log(`checked=${articles.length * 2} failures=${failures.length}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('LIVE ARTICLE NAVIGATION PASS');
