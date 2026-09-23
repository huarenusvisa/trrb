import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, copyFile, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import pageHandler from '../netlify/edge-functions/huarengongzuo-job-prerender.ts';
import sitemapHandler from '../netlify/edge-functions/huarengongzuo-jobs-sitemap.ts';
import {buildTasks} from './build-huarengongzuo-seo-tasks.mjs';
const id='2ce6c398-ae70-438f-8703-c1659bb44b39';
const job={id,title:'仓库招聘',description:'短描述',company_name:'未公开雇主',published_at:'2026-09-01',updated_at:'2026-09-01',expires_at:'2026-09-01',city:'',state_code:'',status:'open',moderation_hold:false};
const context={next:async()=>new Response('fallback',{status:404})};
globalThis.Netlify={env:{get:name=>name==='SUPABASE_URL'?'https://test.invalid':'test-only-key'}};
test('public incomplete/expired listing indexes without invalid JobPosting; host isolation',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(url.searchParams.get('status'),'eq.open');assert.equal(url.searchParams.get('moderation_hold'),'eq.false');return Response.json([job]);};
 try{
 const response=await pageHandler(new Request(`https://huarengongzuo.com/jobs/listing.html?id=${id}`),context);
 const html=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'index, follow');assert.ok(!html.includes('noindex'));assert.ok(!html.includes('data-hg-jobposting'));assert.ok(html.includes(`https://huarengongzuo.com/jobs/listing.html?id=${id}`));
 const head=await pageHandler(new Request(`https://huarengongzuo.com/jobs/listing.html?id=${id}`,{method:'HEAD'}),context);assert.equal(await head.text(),'');
 const other=await pageHandler(new Request(`https://trrb.net/jobs/listing.html?id=${id}`),context);assert.equal(other.status,404);
 }finally{globalThis.fetch=original;}
});
test('complete active employer still receives JobPosting',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json([{...job,description:'完整岗位要求。'.repeat(30),company_name:'Example Employer',city:'New York',state_code:'NY',expires_at:'2099-01-01',contact_public:true,contact_method:'email',contact_value:'jobs@example.com'}]);
 try{const response=await pageHandler(new Request(`https://huarengongzuo.com/jobs/listing.html?id=${id}`),context);assert.ok((await response.text()).includes('data-hg-jobposting'));}finally{globalThis.fetch=original;}
});
test('sitemap paginates past 1000 and retains incomplete public jobs',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.ok(options.signal instanceof AbortSignal);assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(url.searchParams.has('offset'),false);const cursor=url.searchParams.get('id');assert.equal(cursor,calls===1?null:'gt.job-0999');return Response.json(Array.from({length:calls===1?1000:1},(_,i)=>({...job,id:`job-${String((calls-1)*1000+i).padStart(4,'0')}`})));};
 try{const response=await sitemapHandler(new Request('https://huarengongzuo.com/sitemap.xml'),context);assert.equal(response.headers.get('x-hg-sitemap-jobs'),'1001');const xml=await response.text();assert.ok(xml.includes('job-1000'));assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('task manifest emits add/update/delete, is idempotent, rejects incomplete/foreign snapshots',()=>{
 const url=x=>`https://huarengongzuo.com/${x}`;
 const before={complete:true,urls:[{url:url('old'),fingerprint:'1'},{url:url('same'),fingerprint:'1'}]};
 const current={complete:true,urls:[{url:url('new'),fingerprint:'1'},{url:url('same'),fingerprint:'2'}]};
 assert.deepEqual(buildTasks(current,before).tasks.map(x=>x.action),['add','update','delete']);assert.equal(buildTasks(current,current).tasks.length,0);assert.equal(buildTasks(current).dispatch,false);
 assert.throws(()=>buildTasks({...current,complete:false},before));assert.throws(()=>buildTasks({complete:true,urls:[{url:'https://trrb.net/',fingerprint:'1'}]}));
});
test('SEO builder supports expanded city and category routes without losing public jobs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hg-seo-'));
 try {
  for(const path of ['scripts','netlify/edge-functions','huarengongzuo/seo']) await mkdir(join(dir,path),{recursive:true});
  for(const path of ['scripts/build-huarengongzuo-seo.mjs','scripts/build-huarengongzuo-seo-tasks.mjs','netlify/edge-functions/huarengongzuo-jobs-sitemap.ts']) await copyFile(path,join(dir,path));
  await writeFile(join(dir,'huarengongzuo/seo/public-jobs-snapshot.json'),JSON.stringify({complete:true,generated_at:'2026-09-23T00:00:00Z',jobs:[job]}));
  execFileSync(process.execPath,['scripts/build-huarengongzuo-seo.mjs'],{cwd:dir});
  const snapshot=JSON.parse(await readFile(join(dir,'huarengongzuo/seo/current-snapshot.json'),'utf8'));
  const urls=snapshot.urls.map(row=>row.url);
  assert.ok(urls.length>14,'Expanded route set must survive the builder');
  for(const path of ['/jobs/locations/miami/','/jobs/categories/it-tech/',`/jobs/listing.html?id=${id}`]) assert.ok(urls.includes('https://huarengongzuo.com'+path));
  assert.equal(new Set(urls).size,urls.length);
 } finally {await rm(dir,{recursive:true,force:true});}
});


test('sitemap timeout and invalid cursor fall back to the complete published snapshot',async t=>{
 const fallback=()=>new Response('<urlset>complete published snapshot</urlset>',{headers:{'content-type':'application/xml'}});
 for (const failure of ['timeout','repeated-cursor']) {
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
   assert.ok(options.signal instanceof AbortSignal);
   if(failure==='timeout') throw new DOMException('Database deadline exceeded','TimeoutError');
   return Response.json([{id:'same'},{id:'same'}]);
  });
  const response=await sitemapHandler(new Request('https://huarengongzuo.com/sitemap.xml'),{next:fallback});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'<urlset>complete published snapshot</urlset>');
  assert.equal(response.headers.get('x-hg-sitemap-jobs'),null,'Partial pages cannot be reported as a complete live sitemap');
  t.mock.restoreAll();
 }
});
