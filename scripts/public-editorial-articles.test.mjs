import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key';
const {default: handler} = await import('../netlify/functions/public-editorial-articles.ts');
test('editorial listing combines search with topic filter and strips content from response', async t => {
 let query;
 t.mock.method(globalThis,'fetch',async url => {
  query = new URL(url).searchParams;
  return new Response(JSON.stringify([{id:'1',title:'习近平公开活动',content:'中文'.repeat(800),category_name:'热门头条',publication_scope:'topic_only'}]));
 });
 const response = await handler(new Request('https://trrb.net/api?category=中国政治&q=活动&limit=1&offset=3'));
 const payload = await response.json();
 assert.match(query.get('or'),/习近平/);
 assert.match(query.get('and'),/活动/);
 assert.equal(query.get('status'),'eq.published');
 assert.equal(query.get('visibility'),'eq.public');
 assert.equal(payload.next_offset,4);
 assert.equal(payload.articles[0].publication_scope,'topic_only');
 assert.equal(payload.articles[0].body_character_count,1600);
 assert.equal(payload.articles[0].content,undefined);
 assert.ok(payload.articles[0].editorial_topics.includes('xi'));
});
test('enforcement listing retains police and ICE membership; unknown sections fail explicitly', async t => {
 let query;
 t.mock.method(globalThis,'fetch',async url => {query=new URL(url).searchParams;return new Response('[]');});
 const response=await handler(new Request('https://trrb.net/api?category=美国执法与警情'));
 assert.match(query.get('or'),/topic_key.eq.ice/);
 assert.match(query.get('or'),/category_name.eq.美国警情/);
 assert.equal((await response.json()).has_more,false);
 assert.equal((await handler(new Request('https://trrb.net/api?category=未知'))).status,400);
});
