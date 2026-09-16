import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import collection from '../netlify/edge-functions/xi-topic.ts';
import redirect from '../netlify/edge-functions/01-listing-category-canonical.ts';
const context={next:async()=>new Response('pass')};
test('中期选举专题从公开文章读取，保留原文链接和历史分页',async t=>{
 const before=globalThis.Netlify;globalThis.Netlify={env:{get:k=>k==='SUPABASE_URL'?'https://data.test':'test-key'}};
 t.after(()=>{globalThis.Netlify=before;});
 t.mock.method(globalThis,'fetch',async input=>{
  const url=new URL(input);
  assert.equal(url.searchParams.get('status'),'eq.published');assert.equal(url.searchParams.get('visibility'),'eq.public');
  assert.match(url.searchParams.get('or'),/中期选举/);assert.match(url.searchParams.get('or'),/参院战/);assert.match(url.searchParams.get('and'),/2026-01-01/);
  return Response.json(Array.from({length:21},(_,i)=>({id:String(i),title:'参院控制权争夺升温',slug:'senate-'+i,category_name:'美国时政',published_at:'2026-09-16'})));
 });
 const response=await collection(new Request('https://trrb.net/topic/midterm-elections'),context);const html=await response.text();
 assert.equal(response.status,200);assert.match(html,/<h1>2026中期选举实时动态<\/h1>/);
 assert.match(html,/href="\/us-politics\/senate-0"/);assert.match(html,/rel="next" href="\/topic\/midterm-elections\?page=2"/);
 assert.match(html,/rel="canonical" href="https:\/\/trrb.net\/topic\/midterm-elections"/);
 const legacy=await redirect(new Request('https://trrb.net/listing.html?q=中期选举'),context);
 assert.equal(legacy.status,301);assert.equal(legacy.headers.get('location'),'https://trrb.net/topic/midterm-elections');
});
test('正文命中的搜索结果不会被前端标题二次过滤删除',()=>{
 const source=fs.readFileSync(new URL('../listing.js',import.meta.url),'utf8');
 const start=source.indexOf('function filterArticles('),end=source.indexOf('\nfunction renderHeader',start);
 const sandbox={articleTimestamp:()=>0};vm.runInNewContext(source.slice(start,end),sandbox);
 assert.equal(sandbox.filterArticles([{title:'参院控制权争夺升温',matchedSearch:'中期选举'}],'','中期选举').length,1);
 assert.equal(sandbox.filterArticles([{title:'无关报道'}],'','中期选举').length,0);
});
