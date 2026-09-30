import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {rest}=require('../netlify/functions/_shared/supabase-admin.js');
const {listManagedArticles}=require('../netlify/functions/_shared/article-admin-actions.js');
const {pinState}=require('../article-pin-policy.js');
const origin='https://trrb.net';
const target='a71b7ec1-9a80-4e6f-8082-993859186bba';
mkdirSync('artifacts/admin-search-pin-live',{recursive:true});
const report={checked_at:new Date().toISOString(),production_writes:0,tests:[],passed:false};
try{
 const deadline=Date.now()+9*60000;let ready=false;
 while(Date.now()<deadline){
  try{const r=await fetch(origin+'/admin/?qa='+Date.now(),{signal:AbortSignal.timeout(15000),cache:'no-store'});if(r.ok&&(await r.text()).includes('admin-publisher-v2.js?v=20260930-search-pin-1')){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,10000));
 }
 assert.ok(ready,'Updated admin search/pin assets are not deployed yet');
 for(const q of ['任志强','倒习']){
  const start=performance.now();const admin=await listManagedArticles({q,page_size:100},rest);const adminMs=Math.round(performance.now()-start);
  assert.equal(admin.search_limited,false,admin.search_notice||'Full admin search fell back');
  assert.ok(admin.articles.some(a=>a.id===target),'Reported article missing from admin search');
  const publicStart=performance.now();
  const r=await fetch(origin+'/.netlify/functions/public-article-search?q='+encodeURIComponent(q)+'&page_size=50',{signal:AbortSignal.timeout(30000),cache:'no-store'});
  assert.ok(r.ok,'Public search HTTP '+r.status);const publicResult=await r.json();
  assert.equal(publicResult.search_limited,false,'Public search fell back to incomplete results');
  assert.ok(publicResult.articles.some(a=>a.id===target),'Reported article missing from public search');
  assert.ok(publicResult.articles.every(a=>!('metadata' in a)&&!('content' in a)),'Private administrative payload leaked');
  const expected=admin.articles.filter(a=>a.status==='published'&&a.visibility==='public'&&!a.hidden_at&&!a.archived_at&&Date.parse(a.published_at||a.created_at)<=Date.now());
  assert.deepEqual(publicResult.articles.map(a=>a.id).sort(),expected.map(a=>a.id).sort(),'Public status filtering differs from administrator results');
  report.tests.push({keyword:q,admin_matches:admin.articles.length,public_matches:publicResult.articles.length,admin_ms:adminMs,public_ms:Math.round(performance.now()-publicStart),reported_article_found:true,complete_body_search:true,visibility_parity:true});
 }
 const pinned=await listManagedArticles({status:'pinned',page_size:100},rest);
 assert.equal(pinned.recent_hours,null);assert.ok(pinned.articles.every(a=>pinState(a).active));
 report.tests.push({test:'active_pin_filter',active_count:pinned.articles.length,only_unexpired_public_articles:true});
 const response=await fetch(origin+'/.netlify/functions/public-home-focus',{signal:AbortSignal.timeout(30000),cache:'no-store'});
 assert.ok(response.ok);const focus=await response.json();assert.equal(focus.manual_pin_hours,48);
 assert.ok((focus.articles||[]).every(a=>a.homepage_focus_source!=='editor'||pinState(a).active));
 report.tests.push({test:'public_home_focus',pin_hours:48,no_expired_manual_priority:true});
 report.passed=true;
 console.log(JSON.stringify({event:'admin-search-pin-live-acceptance',...report}));
}finally{writeFileSync('artifacts/admin-search-pin-live/result.json',JSON.stringify(report,null,2));}
