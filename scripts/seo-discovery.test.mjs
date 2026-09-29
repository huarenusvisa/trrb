import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSitemapDecisions,sitemapArticleSignature,verifiedSitemapExclusion} from './sitemap-decisions.mjs';
import {buildInventory} from './content-inventory.mjs';
import {publicEvidence} from '../netlify/shared/publication.mjs';
import route from '../netlify/edge-functions/seo-route-meta.ts';
import community from '../netlify/edge-functions/community-directory.ts';
const now=new Date('2026-09-29T12:00:00Z');
const a={id:'a',title:'同一标题的不同报道',content:'报道正文'.repeat(60),status:'published',visibility:'public',published_at:'2026-09-28T12:00:00Z',publication_path:'/news/a',publication_revision:'1'};
test('same titles preserve distinct bodies; only exact long bodies are excluded',()=>{
 const decisions=createSitemapDecisions();
 assert.equal(decisions.duplicateOf(a,a.content),null);
 assert.equal(decisions.duplicateOf({...a,id:'b'},a.content+'新的事实'),null);
 assert.equal(decisions.duplicateOf({...a,id:'c'},a.content),'a');
 assert.equal(decisions.duplicateOf({...a,id:'d'},'短讯'),null);
});
test('inventory distinguishes verified category exclusion from actual omission without concealing changes',()=>{
 const manifest={version:1,generatedAt:now.toISOString(),exclusions:[{id:a.id,reason:'category-policy',signature:sitemapArticleSignature(a)}]};
 const search={local:{inventorySitemapUrls:[],inventorySitemapExclusions:manifest}};
 let result=buildInventory([a],{search,now});
 assert.equal(result.summary.missingFromSitemap,0);assert.equal(result.summary.sitemapExcludedByPolicy,1);
 assert.ok(result.items[0].issues.includes('sitemap-excluded-category-policy-review'));
 result=buildInventory([{...a,category_name:'新栏目'}],{search,now});assert.equal(result.summary.missingFromSitemap,1);
 assert.equal(verifiedSitemapExclusion(a,manifest,new Date('2026-10-02')),null);
 assert.equal(buildInventory([a],{now,search:{local:{inventorySitemapUrls:[]}}}).summary.missingFromSitemap,1);
});
test('source_links are evidence candidates, never inferred from attribution flags or internal links',()=>{
 assert.deepEqual(publicEvidence({metadata:{public_source_attribution:true,source_links:['https://ice.gov/a','https://trrb.net/news/a','javascript:alert(1)',{url:'https://uscis.gov/a'}]}}),['https://ice.gov/a','https://uscis.gov/a']);
});
for(const [path,file,title,count] of [
 ['/immigrate/','immigrate/index.html','移民美国知识库',50],
 ['/immigrate/center?path=study','immigrate/center.html','赴美留学知识中心',7],
 ['/immigrate/center?path=study&topic=f1','immigrate/center.html','F-1学生签证知识中心',7]
])test(`initial HTML exposes real directory: ${path}`,async()=>{
 const response=await route(new Request('https://trrb.net'+path),{next:async()=>new Response(fs.readFileSync(file,'utf8'),{headers:{'content-type':'text/html','content-length':'1',etag:'old'}})});
 const html=await response.text();assert.match(html,new RegExp(title));
 assert.ok((html.match(/href="\/immigrate\/center\?path=/g)||[]).length>=count);
 assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('content-length'),null);
 assert.match(html,/<meta name="robots" content="index,follow/);
});
test('community renders only public indexable cards and does not forward credentials',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(new URL(url).pathname,'/.netlify/functions/community-api');
  assert.deepEqual(Object.keys(options.headers),['Accept']);
  return Response.json({posts:[{id:'a',status:'published',is_indexable:true,title:'<script>alert(1)</script>',content:'公开内容'}, {id:'b',status:'draft',is_indexable:true,title:'PRIVATE'}, {id:'c',status:'published',is_indexable:false,title:'NOINDEX'}]});
 });
 const response=await community(new Request('https://trrb.net/community/',{headers:{Cookie:'secret',Authorization:'secret'}}),{next:async()=>new Response(fs.readFileSync('community/index.html','utf8'),{headers:{'content-type':'text/html'}})});
 const html=await response.text();assert.match(html,/href="\/community\/\?post=a"/);assert.ok(!html.includes('PRIVATE'));assert.ok(!html.includes('NOINDEX'));assert.match(html,/&lt;script&gt;alert/);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(html,/移民社区导读/);assert.match(html,/href="\/ice\/news"/);
});
test('community API failure keeps the page usable; detail views are untouched',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
 const context={next:async()=>new Response('<h1 id="feed-title">推荐内容</h1>',{headers:{'content-type':'text/html'}})};
 const fallback=await community(new Request('https://trrb.net/community/'),context);assert.equal(fallback.status,200);assert.match(await fallback.text(),/美国移民社区/);
 assert.equal(await (await community(new Request('https://trrb.net/community/?post=a'),context)).text(),'<h1 id="feed-title">推荐内容</h1>');
});
