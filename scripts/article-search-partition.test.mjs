import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{readArticleList}=require('../netlify/functions/_shared/article-list-reader.js');
const id=(part,n)=>part+'0000000-0000-0000-0000-'+String(n).padStart(12,'0');
function fixture(rows){const calls=[];return {calls,rest:async(resource,{query:q})=>{
 assert.equal(resource,'articles');assert.equal(q.status,'eq.published');assert.equal(q.visibility,'eq.public');assert.equal(q.hidden_at,'is.null');assert.equal(q.archived_at,'is.null');assert.match(q.and,/content\.ilike/);
 calls.push(q);
 if(q.id.startsWith('in.')){const selected=q.id.slice(4,-1).split(',');return rows.filter(r=>selected.includes(r.id));}
 const [op,lower]=q.id.split('.'),upper=q.and.match(/id\.lt\.([a-f0-9-]+)/)?.[1];
 return rows.filter(r=>(op==='gt'?r.id>lower:r.id>=lower)&&(!upper||r.id<upper)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Number(q.limit)).map(({id,published_at,created_at})=>({id,published_at,created_at}));
 }};}

test('full-text fallback covers all 16 disjoint ranges and does not re-filter body-only hits by headline',async()=>{
 const rows=Array.from({length:16},(_,i)=>({id:id(i.toString(16),1),title:'不含关键词的标题',summary:'不含关键词的摘要',published_at:`2025-01-${String(i+1).padStart(2,'0')}T00:00:00Z`,created_at:'2025-01-01T00:00:00Z'}));
 const f=fixture(rows),r=await readArticleList({q:'倒习',page_size:3},{publicOnly:true},f.rest);
 assert.equal(r.search_scope,'full_text_partitioned');assert.equal(r.search_limited,false);assert.equal(r.search_notice,null);assert.equal(r.articles.length,3);assert.equal(r.articles[0].id,id('f',1));assert.equal(r.has_more,true);
 assert.equal(f.calls.filter(q=>q.order==='id.asc').length,16);assert.equal(new Set(f.calls.filter(q=>q.order==='id.asc').map(q=>q.id[4])).size,16);
});
test('global pagination is correct across partitions and preserves explicit nonaligned offsets',async()=>{
 const rows=Array.from({length:16},(_,i)=>({id:id(i.toString(16),1),title:'测试',published_at:`2025-01-${String(i+1).padStart(2,'0')}T00:00:00Z`,created_at:'2025-01-01T00:00:00Z'}));
 const r=await readArticleList({q:'倒习',offset:5,page_size:3},{publicOnly:true},fixture(rows).rest);
 assert.deepEqual(r.articles.map(x=>x.id),['a','9','8'].map(p=>id(p,1)));assert.equal(r.has_more,true);
});
test('full 1000-row range continues with a keyset cursor rather than silently truncating matches',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({id:id('a',i+1),title:'测试',published_at:'2025-01-01T00:00:00Z',created_at:'2025-01-01T00:00:00Z'}));
 const f=fixture(rows),r=await readArticleList({q:'倒习',offset:1000,page_size:3},{publicOnly:true},f.rest);
 assert.equal(r.search_limited,false);assert.equal(r.articles.length,1);assert.equal(r.articles[0].id,id('a',1));assert.ok(f.calls.some(q=>q.id==='gt.'+id('a',1000)));assert.equal(r.has_more,false);
});
test('one failed range never masquerades as complete full-text results',async()=>{
 let requests=0;
 const r=await readArticleList({q:'倒习'},{publicOnly:true},async(_resource,{query})=>{requests++;if(query.order==='id.asc')throw new Error('database range unavailable');assert.doesNotMatch(query.and,/content\.ilike/);return [{id:id('a',1),title:'倒习'}];});
 assert.equal(r.search_limited,true);assert.equal(r.search_scope,'title_summary');assert.match(r.search_notice,/仅正文命中/);assert.ok(requests<=3);
});
