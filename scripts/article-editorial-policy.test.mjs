import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../article-editorial-policy.js';
const body = n => '中'.repeat(n);
test('1499字不得进要闻，1500字达标；标题、图片、广告和强制置顶不能绕过门槛', () => {
  const row = {content:body(1499), title:body(200), summary:body(200),metadata:{homepage_focus_override:'force'}};
  assert.equal(policy.importantEligible(row),false);
  assert.equal(policy.importantEligible({...row,content:body(1500)}),true);
  assert.equal(policy.importantEligible({...row,content:body(1499)+'！1234 https://example.com/'+body(200)}),false);
  assert.equal(policy.importantEligible({...row,content:body(1499)+`<img alt="${body(200)}"><script>${body(200)}</script>唐人日报赞助商${body(500)}`}),false);
  assert.equal(policy.importantEligible({...row,content:body(1600),metadata:{publication_scope:'topic_only',homepage_focus_override:'force'}}),false);
});
test('无正文时只接受当前服务端字数口径，拒绝旧缓存的宽松计数',()=>{
 assert.equal(policy.importantEligible({longform_chars:1800}),false);
 assert.equal(policy.importantEligible({longform_chars:1500,editorial_policy_version:policy.VERSION}),true);
 assert.equal(policy.importantEligible({longform_chars:1500,editorial_policy_version:policy.VERSION,publication_scope:'topic_only'}),false);
});
test('生产要闻接口强制过滤短稿、选题短讯与未来日期，并保留合格稿', async t => {
 process.env.SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-placeholder';
 const handler=(await import('../netlify/functions/public-home-focus.ts')).default;
 const base={category_name:'美国时政',published_at:new Date().toISOString(),metadata:{homepage_focus_override:'force'}};
 t.mock.method(globalThis,'fetch',async()=>Response.json([
  {...base,id:'short',content:body(1499)+'1'.repeat(400)},
  {...base,id:'long',content:body(1500)},
  {...base,id:'topic',content:body(1600),metadata:{publication_scope:'topic_only',homepage_focus_override:'force'}},
  {...base,id:'future',content:body(1600),published_at:new Date(Date.now()+3600000).toISOString()}
 ]));
 const response=await handler(new Request('https://example.test/.netlify/functions/public-home-focus'));
 assert.equal(response.status,200);const result=await response.json();
 assert.deepEqual(result.articles.map(a=>a.id),['long']);
 assert.equal(result.articles[0].body_character_count,1500);
 assert.equal(result.articles[0].editorial_policy_version,policy.VERSION);
 assert.equal((await handler(new Request('https://example.test',{method:'OPTIONS'}))).status,204);
});

test('首页与栏目接口保留选题专属标记和有效正文长度',async t=>{
 process.env.SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-placeholder';
 const row={id:'brief',title:'学校公布新的教学安排',summary:'校方发布通知',content:'中'.repeat(440),category_name:'美国时政',status:'published',visibility:'public',published_at:new Date().toISOString(),publication_scope:'topic_only'};
 t.mock.method(globalThis,'fetch',async()=>Response.json([row]));
 for(const name of ['public-home-bundle','public-home-articles']){
  const handler=(await import(`../netlify/functions/${name}.ts`)).default;
  const response=await handler(new Request(`https://example.test/.netlify/functions/${name}`));
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.articles[0].publication_scope,'topic_only');
  assert.equal(result.articles[0].body_character_count,440);
  assert.equal((await handler(new Request('https://example.test',{method:'OPTIONS'}))).status,204);
 }
});
