import assert from 'node:assert/strict';
import test from 'node:test';
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
 globalThis.fetch=async(url)=>{calls++;assert.equal(url.searchParams.get('deleted_at'),'is.null');const offset=Number(url.searchParams.get('offset'));return Response.json(Array.from({length:offset===0?1000:1},(_,i)=>({...job,id:`job-${offset+i}`})));};
 try{const response=await sitemapHandler(new Request('https://huarengongzuo.com/sitemap.xml'),context);assert.equal(response.headers.get('x-hg-sitemap-jobs'),'1001');const xml=await response.text();assert.ok(xml.includes('job-1000'));assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('task manifest emits add/update/delete, is idempotent, rejects incomplete/foreign snapshots',()=>{
 const url=x=>`https://huarengongzuo.com/${x}`;
 const before={complete:true,urls:[{url:url('old'),fingerprint:'1'},{url:url('same'),fingerprint:'1'}]};
 const current={complete:true,urls:[{url:url('new'),fingerprint:'1'},{url:url('same'),fingerprint:'2'}]};
 assert.deepEqual(buildTasks(current,before).tasks.map(x=>x.action),['add','update','delete']);assert.equal(buildTasks(current,current).tasks.length,0);assert.equal(buildTasks(current).dispatch,false);
 assert.throws(()=>buildTasks({...current,complete:false},before));assert.throws(()=>buildTasks({complete:true,urls:[{url:'https://trrb.net/',fingerprint:'1'}]}));
});
