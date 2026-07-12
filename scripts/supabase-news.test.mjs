import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSupabaseProjectUrl,
  upsertAutomatedArticle,
  upsertNewsCandidate,
  writeAutomationLog,
  syncSourceRegistry,
} from './supabase-news.mjs';

test('normalizes pasted Supabase REST URLs to the project origin', () => {
  assert.equal(normalizeSupabaseProjectUrl('https://abc.supabase.co/rest/v1/'), 'https://abc.supabase.co');
  assert.equal(normalizeSupabaseProjectUrl('https://abc.supabase.co/project/default'), 'https://abc.supabase.co');
  assert.equal(normalizeSupabaseProjectUrl('abc.supabase.co/rest/v1'), 'https://abc.supabase.co');
});

test('writes articles, candidates, sources and logs to canonical REST paths', async () => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co/rest/v1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/categories?')) {
      return new Response(JSON.stringify([{ id: 'cat-1', name: 'ICE执法' }]), { status: 200 });
    }
    if (String(url).includes('/articles?')) {
      return new Response(JSON.stringify([{ id: 'article-1' }]), { status: 201 });
    }
    if (String(url).includes('/news_candidates?')) {
      return new Response(JSON.stringify([{ id: 1 }]), { status: 201 });
    }
    return new Response('', { status: 201 });
  };
  try {
    const article = await upsertAutomatedArticle({
      externalId: 'x-ice-1', title: '测试新闻标题', summary: '测试摘要', content: '测试正文',
      categoryName: 'ICE执法', primarySection: 'ICE执法', status: 'published', sourceUrl: 'https://x.com/a/status/1',
    });
    assert.equal(article.article.id, 'article-1');
    await upsertNewsCandidate({ externalId: 'x-ice-1', pipeline: 'ice-radar-v4' });
    await syncSourceRegistry([{ id: 'ice-hq', name: 'ICE', level: 'federal' }]);
    await writeAutomationLog({ pipeline: 'ice-radar-v4', fetched: 1 });
  } finally {
    global.fetch = originalFetch;
  }
  assert.ok(calls.every(c => c.url.startsWith('https://abc.supabase.co/rest/v1/')));
  assert.ok(calls.some(c => c.url.includes('/articles?on_conflict=external_id')));
  assert.ok(calls.some(c => c.url.includes('/news_candidates?on_conflict=external_id')));
  assert.ok(calls.some(c => c.url.includes('/news_sources?on_conflict=id')));
  assert.ok(calls.some(c => c.url.endsWith('/automation_logs')));
});
