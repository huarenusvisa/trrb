import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicationUrl,publicEvidence} from '../netlify/shared/publication.mjs';
import {buildInventory,readInventory,persistInventory} from './content-inventory.mjs';
import articlePage from '../netlify/edge-functions/article-prerender.ts';
const now = new Date('2026-09-24T12:00:00Z');
const article = {id:'a',title:'现场报道',slug:'a',content:'现场事实',category_name:'ICE执法动态',topic_key:'ice',status:'published',visibility:'public',published_at:'2026-09-23T12:00:00Z',publication_path:'/ice/a',publication_revision:'v1',source_url:'https://www.ice.gov/news/a'};
test('pinned URL survives title, category and slug changes in all consumers',()=>{
 const changed={...article,title:'更正标题',slug:'new',topic_key:'politics',category_name:'美国时政'};
 assert.equal(publicationUrl(changed),'https://trrb.net/ice/a');
 const sandbox={window:{},document:{readyState:'loading',addEventListener(){}},Map,Set,URL,console};
 vm.runInNewContext(fs.readFileSync('article-route-runtime.js','utf8'),sandbox);
 assert.equal(sandbox.window.TRRB_articleUrl(changed),'/ice/a');
});
test('untrusted external or malformed publication paths are rejected',()=>{
 for(const path of ['//evil.test/a','https://evil.test/a','/ice/a?q=1','/ice/../a','/ice/a\\b','/ice/a b'])assert.equal(publicationUrl({publication_path:path}),'');
});
test('source evidence never trusts self-links, credentials or unsafe schemes',()=>{
 assert.deepEqual(publicEvidence({source_url:'javascript:alert(1)',metadata:{evidence:[{url:'https://trrb.net/a'},{url:'https://u:p@example.org/'},{url:'https://ice.gov/a'},{url:'https://ice.gov/a'}]}}),['https://ice.gov/a']);
});
test('full inventory pages without a row cap or lost last page',async()=>{
 const rows=Array.from({length:7},(_,i)=>({id:String(i)}));let calls=0;
 const got=await readInventory(async(_table,q)=>{calls++;return rows.filter(x=>!q.id||x.id>q.id.slice(3)).slice(0,+q.limit);},3);
 assert.equal(got.length,7);assert.equal(calls,3);
});
test('inventory fails rather than silently accepting a repeated page',async()=>{
 await assert.rejects(readInventory(async()=>[{id:'a'},{id:'b'}],2),/Non-advancing/);
});
test('missing Google observations stay unknown, not unindexed or zero',()=>{
 const r=buildInventory([article],{now});assert.equal(r.summary.public,1);assert.equal(r.items[0].google.status,'unknown');assert.equal(r.items[0].google.performance,null);assert.equal(r.items[0].bing.status,'unknown');
});
test('exact body duplicates become review candidates, not deleted related events',()=>{
 const r=buildInventory([article,{...article,id:'b',publication_path:'/ice/b'},{...article,id:'c',content:'后续新增事实',publication_path:'/ice/c'}],{now});
 assert.equal(r.items.length,3);assert.equal(r.summary.duplicateCandidates,1);assert.equal(r.items.find(x=>x.id==='c').duplicateCandidateOf,null);
});
test('private, withdrawn and future publications are not public in the ledger',()=>{
 const r=buildInventory([{...article,visibility:'private'},{...article,id:'b',hidden_at:now.toISOString()},{...article,id:'c',published_at:'2030-01-01'}],{now});assert.equal(r.summary.public,0);
});
test('snapshot renders its revision without category lookup and cannot serve withdrawn content',async t=>{
 const old=globalThis.Deno;globalThis.Deno={env:{get:k=>k==='SUPABASE_URL'?'https://db.test':'key'}};t.after(()=>globalThis.Deno=old);
 t.mock.method(globalThis,'fetch',async input=>{const u=new URL(String(input));if(u.pathname==='/rest/v1/articles'){
   assert.equal(u.searchParams.get('hidden_at'),'is.null');assert.equal(u.searchParams.get('archived_at'),'is.null');assert.match(u.searchParams.get('published_at'),/^lte\./);
   return Response.json([{...article,publication_html:'<p>发布时正文</p>',category_name:'美国时政',topic_key:'politics'}]);
 }if(u.pathname==='/article.html')return new Response('<html><head></head><body><article class="container article-page" id="article-root"></article></body></html>');throw new Error('Unexpected category lookup');});
 const r=await articlePage(new Request('https://trrb.net/ice/a'),{next:()=>new Response('',{status:404})});
 assert.equal(r.status,200);assert.equal(r.headers.get('x-trrb-publication-revision'),'v1');assert.match(r.headers.get('cache-control'),/must-revalidate/);assert.match(await r.text(),/发布时正文/);
});

test('homepage delegates to the stable router before category-based fallbacks',()=>{
 const source=fs.readFileSync('articles-home.js','utf8');
 const fn=source.slice(source.indexOf('function articleUrl(article) {'),source.indexOf('function renderHome('));
 const sandbox={window:{TRRB_articleUrl:()=>'/ice/original'}};vm.runInNewContext(fn,sandbox);
 assert.equal(sandbox.articleUrl({...article,slug:'changed',category:'美国时政'}),'/ice/original');
});
test('full sitemap reconciliation records review gaps without claiming unindexed',()=>{
 const result=buildInventory([article],{now,search:{local:{inventorySitemapUrls:[]}}});
 assert.equal(result.summary.missingFromSitemap,1);assert.equal(result.items[0].inSitemap,false);assert.equal(result.items[0].google.status,'unknown');
});

test('inventory writes bounded batches and publishes only after all succeed',async()=>{
 const calls=[];await persistInventory({commit_sha:'sha',summary:{total:5},items:Array.from({length:5},(_,i)=>({...buildInventory([{...article,id:String(i)}],{now}).items[0]}))},async(method,table,q,body)=>{calls.push({method,table,body});return [];},{batchSize:2});
 assert.deepEqual(calls.filter(x=>x.table==='seo_content_inventory_items').map(x=>x.body.length),[2,2,1]);
 assert.equal(calls[0].body.is_complete,false);assert.equal(calls[4].body.is_complete,true);
 const failed=[];await assert.rejects(persistInventory({summary:{},items:[{...article,pilot:true,issues:[]}]},async(method,table,q,body)=>{failed.push({method,body});if(table==='seo_content_inventory_items')throw new Error('batch unavailable');return [];}),/batch unavailable/);
 assert.equal(failed.some(x=>x.body?.is_complete===true),false);
});
