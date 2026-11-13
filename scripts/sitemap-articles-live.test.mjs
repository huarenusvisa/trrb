import assert from 'node:assert/strict';
import test from 'node:test';
import { addLiveSitemapChildren, config, renderLiveSitemap } from '../netlify/edge-functions/sitemap-articles-live.ts';

const start = '2026-11-10T13:00:00.000Z';
const end = '2026-11-11T13:00:00.000Z';
const day = '2026-11-11';
const date = '2026-11-11T00:00:00.000Z';
const article = (id, fields = {}) => ({
  id, publication_path: `/news/${id}`, category_id: 'news', title: '新闻',
  content: `不同的报道正文 ${id}`, published_at: date, ...fields,
});

test('live shard selects public eligible pinned URLs across pages at a shared publication timestamp', async () => {
  const requests = [];
  const firstPage = Array.from({ length: 200 }, (_, i) => article(`first-${199 - i}`));
  const longBody = '重复正文'.repeat(40);
  const xml = await renderLiveSitemap(async (table, params) => {
    if (table === 'categories') {
      assert.equal(params.include_in_sitemap, 'not.is.false');
      return [{ id: 'news', name: '新闻' }];
    }
    requests.push(params);
    if (requests.length === 1) return firstPage;
    return [
      article('second', { publication_updated_at: '2026-11-11T01:00:00Z' }),
      article('topic', { category_id: 'unknown', topic_key: 'ice' }),
      article('blocked-category', { category_id: 'unknown' }),
      article('empty', { content: '<p>&nbsp;</p>' }),
      article('legacy', { publication_path: '' }),
      article('same-link', { publication_path: '/news/second' }),
      article('duplicate-winner', { content: longBody }),
      article('duplicate-body', { content: longBody }),
    ];
  }, start, end, day);

  assert.equal(requests.length, 2);
  for (const params of requests) {
    assert.deepEqual([params.status, params.visibility, params.hidden_at, params.archived_at], ['eq.published', 'eq.public', 'is.null', 'is.null']);
    assert.equal(params.order, 'published_at.desc,id.desc');
    assert.ok(params.and.includes(`published_at.gt.${start},published_at.lte.${end}`));
    assert.ok(params.and.includes('published_at.gte.2026-11-11T00:00:00.000Z,published_at.lt.2026-11-12T00:00:00.000Z'));
  }
  assert.ok(requests[1].and.includes(`and(published_at.eq.${date},id.lt.first-0)`));
  assert.match(xml, /\/news\/second<\/loc><lastmod>2026-11-11T01:00:00.000Z/);
  assert.match(xml, /\/news\/topic<\/loc>/);
  assert.match(xml, /\/news\/duplicate-winner<\/loc>/);
  assert.doesNotMatch(xml, /blocked-category|duplicate-body|\/news\/(?:empty|legacy)<\/loc>/);
  assert.equal([...xml.matchAll(/<loc>/g)].length, 203);
});

test('a failed or invalid page does not produce a partial successful sitemap', async () => {
  await assert.rejects(renderLiveSitemap(async table => table === 'categories' ? [] : [article('future', { published_at: '2026-11-12T00:00:00Z' })], start, end, day), /outside/);
  await assert.rejects(renderLiveSitemap(async table => {
    if (table === 'categories') return [];
    throw new Error('database unavailable');
  }, start, end, day), /database unavailable/);
});

test('index retains static children and lists each live UTC day since the snapshot', () => {
  const xml = '<sitemapindex><sitemap><loc>https://trrb.net/sitemap-articles-1.xml</loc></sitemap></sitemapindex>';
  const actual = addLiveSitemapChildren(xml, start, end);
  const expected = ['/sitemap-articles-1.xml', '/sitemap-articles-live-2026-11-10.xml', '/sitemap-articles-live-2026-11-11.xml'];
  assert.deepEqual([...actual.matchAll(/<loc>https:\/\/trrb\.net([^<]+)/g)].map(match => match[1]), expected);
  const pattern = new RegExp(config.pattern);
  assert.ok(pattern.test('/sitemap.xml'));
  assert.ok(pattern.test(expected[2]));
  assert.ok(!pattern.test(expected[0]));
  assert.equal(addLiveSitemapChildren('<urlset/>', start, end), '<urlset/>');
});
