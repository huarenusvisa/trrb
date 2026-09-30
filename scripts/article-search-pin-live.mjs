import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const reported='a71b7ec1-9a80-4e6f-8082-993859186bba';
const results=[];mkdirSync('artifacts/article-search-pin-live',{recursive:true});
if(process.argv.includes('--backend')){
 const {readArticleList}=require('../netlify/functions/_shared/article-list-reader.js');
 const {rest}=require('../netlify/functions/_shared/supabase-admin.js');
 for(const q of ['任志强','倒习'])for(const publicOnly of [false,true]){
  const start=Date.now(),r=await readArticleList({q},{publicOnly},rest);
  assert.equal(r.search_limited,false,`${q}: full-text matching did not finish`);assert.equal(r.search_scope,'full_text_partitioned');assert.ok(r.articles.some(a=>a.id===reported),'Reported public article must be found');
  if(publicOnly)for(const a of r.articles){assert.equal(a.metadata,undefined);assert.equal(a.content,undefined);}
  results.push({q,scope:publicOnly?'public':'admin',matching_first_page:r.articles.length,reported_article_found:true,full_text:true,elapsed_ms:Date.now()-start});
 }
 console.log(JSON.stringify({event:'article-search-real-data-readonly',results,production_writes:0}));
 writeFileSync('artifacts/article-search-pin-live/backend.json',JSON.stringify({results,production_writes:0},null,2));
}else{
 const origin='https://trrb.net',until=Date.now()+8*60000;
 let ready=false;
 while(Date.now()<until){try{const r=await fetch(origin+'/admin/?qa='+Date.now(),{signal:AbortSignal.timeout(15000)});if(r.ok&&(await r.text()).includes('20260930-search-pin')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,15000));}
 assert.ok(ready,'Updated admin assets not deployed');
 for(const q of ['任志强','倒习']){
  const start=Date.now(),r=await fetch(origin+'/.netlify/functions/public-article-search?q='+encodeURIComponent(q),{signal:AbortSignal.timeout(30000)});assert.ok(r.ok);const data=await r.json();assert.equal(data.search_limited,false);assert.ok(data.articles.some(a=>a.id===reported));results.push({q,public_http:true,matches:data.articles.length,full_text:true,elapsed_ms:Date.now()-start});
 }
 const focus=await fetch(origin+'/.netlify/functions/public-home-focus',{signal:AbortSignal.timeout(20000)});assert.ok(focus.ok);const data=await focus.json();assert.equal(data.manual_pin_hours,48);
 assert.ok(!data.articles.some(a=>a.id===reported&&a.homepage_pin?.active));
 results.push({homepage_expiry_contract:48,expired_reported_article_not_pinned:true});
 const {chromium}=await import('/tmp/article-admin-browser/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:1000}});
   await page.goto(origin+'/listing.html?q='+encodeURIComponent('任志强'),{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#listing-grid')?.textContent.includes('任志强'),{},{timeout:40000});
   await page.screenshot({path:`artifacts/article-search-pin-live/${width>760?'PC':'Mobile'}-search-result.png`,fullPage:true});
   results.push({width,search_page_displays_result:true});await page.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({event:'article-search-pin-production-acceptance',results,production_writes:0}));writeFileSync('artifacts/article-search-pin-live/production.json',JSON.stringify({results,production_writes:0},null,2));
}
