import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import policy from '../article-editorial-policy.js';

test('news cards render even while the independent focus request is pending',async()=>{
 const source=fs.readFileSync(new URL('../articles-home.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function loadHome() {'),source.indexOf('\nfunction shortDate'));
 let resolveFocus;const focus=new Promise(r=>resolveFocus=r);const rendered=[];
 const context={document:{documentElement:{dataset:{}}},console,fetchHomepageFocus:()=>focus,fetchUnifiedHomeBundle:async()=>[{id:'news'}],renderHome:rows=>rendered.push(rows[0].id),renderHeroCarousel:rows=>rendered.push(rows[0].id)};
 vm.createContext(context);vm.runInContext(fn,context);
 const done=context.loadHome();await new Promise(r=>setImmediate(r));
 assert.deepEqual(rendered,['news']);assert.equal(context.document.documentElement.dataset.homePrimaryPending,'false');
 resolveFocus([{id:'focus'}]);await done;assert.deepEqual(rendered,['news','focus']);
});

test('homepage card payload omits full bodies while preserving editorial eligibility',async t=>{
 process.env.SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-placeholder';
 const row={id:'long',title:'美国国会举行听证会',summary:'委员会讨论公开议题',content:'中'.repeat(3500),category_name:'美国时政',status:'published',visibility:'public',published_at:new Date().toISOString()};
 t.mock.method(globalThis,'fetch',async()=>Response.json([row]));
 const handler=(await import('../netlify/functions/public-home-bundle.ts')).default;
 const response=await handler(new Request('https://example.test/.netlify/functions/public-home-bundle'));
 assert.equal(response.status,200);const {articles}=await response.json();
 assert.equal(articles.length,1);assert(!('content' in articles[0]));
 assert.equal(articles[0].body_character_count,3500);assert(policy.importantEligible(articles[0]));
 assert.equal(articles[0].summary,row.summary);assert(JSON.stringify(articles).length<1000);
});
