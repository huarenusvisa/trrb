import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {identity,saveManualArticle,lookupManualPublication}=require('../netlify/functions/_shared/manual-article-save.js');
const actor={user:{id:'10000000-0000-4000-8000-000000000001'},admin:{role:'owner'}};
const input={request_id:'20000000-0000-4000-8000-000000000002'};
const payload={title:'隔离发布测试不得出现在正式社区',content:'测试正文',author:'Test',category_name:'美国时政',status:'published',visibility:'public',metadata:{},slug:'synthetic'};
function database({lost=false,failBefore=false,failWrite=false}={}){
 let row=null,posts=0;
 return {get posts(){return posts;},get row(){return row;},rest:async(table,options)=>{
  assert.equal(table,'articles');assert.ok(options.timeoutMs>0);
  if(options.method==='POST'){posts++;if(failWrite)throw Object.assign(new Error('upstream timed out'),{statusCode:504});if(row)throw Object.assign(new Error('duplicate key'),{statusCode:409});row=structuredClone(options.body);if(lost)throw Object.assign(new Error('response lost after commit'),{statusCode:504});return [row];}
  assert.match(options.query.id,/^eq\.[a-f0-9-]{36}$/);assert.equal(options.query.limit,'1');if(failBefore)throw new Error('Read unavailable');return row?[row]:[];
 }};
}
test('same authenticated actor and request produces same primary key, other actors cannot collide',()=>{
 assert.equal(identity(actor.user.id,input.request_id),identity(actor.user.id,input.request_id));assert.notEqual(identity(actor.user.id,input.request_id),identity('30000000-0000-4000-8000-000000000003',input.request_id));assert.throws(()=>identity('bad',input.request_id),/无效/);
});
test('a successful save is confirmed and a replay performs no second insert',async()=>{
 const db=database();const first=await saveManualArticle(payload,input,actor,db.rest);const again=await saveManualArticle(payload,input,actor,db.rest);assert.equal(db.posts,1);assert.equal(first.confirmed,true);assert.equal(again.replayed,true);assert.equal(first.article.id,again.article.id);assert.equal(first.article.metadata,undefined);
});
test('504 after database commit is recovered by exact ID rather than another POST',async()=>{
 const db=database({lost:true}),result=await saveManualArticle(payload,input,actor,db.rest);assert.equal(db.posts,1);assert.equal(result.confirmed,true);assert.equal(result.replayed,true);
});
test('unconfirmed write never returns success and never automatically repeats POST',async()=>{
 const db=database({failWrite:true});await assert.rejects(saveManualArticle(payload,input,actor,db.rest),e=>e.code==='PUBLISH_RESULT_UNKNOWN');assert.equal(db.posts,1);assert.equal(db.row,null);
});
test('failed preflight read performs no write',async()=>{
 const db=database({failBefore:true});await assert.rejects(saveManualArticle(payload,input,actor,db.rest),e=>e.code==='PUBLISH_LOOKUP_UNAVAILABLE');assert.equal(db.posts,0);
});
test('changed payload under the same request never overwrites a committed article',async()=>{
 const db=database();await saveManualArticle(payload,input,actor,db.rest);await assert.rejects(saveManualArticle({...payload,content:'changed'},input,actor,db.rest),e=>e.code==='PUBLISH_PAYLOAD_CONFLICT');assert.equal(db.posts,1);assert.equal(db.row.content,'测试正文');
});
test('not found is explicitly unconfirmed; successful status checks enforce actor ownership',async()=>{
 const db=database();assert.equal((await lookupManualPublication(input,actor,db.rest)).confirmed,false);await saveManualArticle(payload,input,actor,db.rest);assert.equal((await lookupManualPublication(input,actor,db.rest)).confirmed,true);
 const foreign=async()=>[{...db.row,metadata:{...db.row.metadata,manual_actor_id:'other'}}];await assert.rejects(lookupManualPublication(input,actor,foreign),e=>e.code==='PUBLISH_RECORD_CONFLICT');
});
function client(fetch){
 const storage=new Map();const context={crypto:webcrypto,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,atob,fetch,__TRRB_PUBLISH_CONFIRM_DELAYS__:[0,0,0],sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};context.window=context;vm.runInNewContext(readFileSync('admin/manual-publish-request.js','utf8'),context);return context.TrrbManualPublish;
}
const token='test.'+Buffer.from(JSON.stringify({sub:actor.user.id})).toString('base64url')+'.signature';
test('browser uses same request identity after ambiguous failure and reports uncertainty',async()=>{
 const calls=[];const api=client(async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);return body.action==='publication_status'?Response.json({confirmed:false}):new Response('',{status:504});});
 for(let i=0;i<2;i++)await assert.rejects(api.call({api:'/test',token,action:'save_article',payload}),/尚未确认/);
 assert.equal(calls.filter(c=>c.action==='save_article')[0].request_id,calls.filter(c=>c.action==='save_article')[1].request_id);
});
test('browser distinguishes cover timeout and does not start publication status lookup',async()=>{
 let calls=0;const api=client(async()=>{calls++;return new Response('',{status:504});});await assert.rejects(api.call({api:'/test',token,action:'upload_cover',payload:{}}),/封面上传超时，尚未进入文章保存/);assert.equal(calls,1);
});
test('browser recognizes confirmed lost response as success',async()=>{
 const api=client(async(url,init)=>JSON.parse(init.body).action==='publication_status'?Response.json({confirmed:true,article:{id:'saved',status:'published'}}):new Response('',{status:504}));const result=await api.call({api:'/test',token,action:'save_article',payload});assert.equal(result.confirmed,true);
});
test('browser keeps checking the deterministic publication ID while the database commit becomes visible',async()=>{
 let checks=0;const api=client(async(url,init)=>{const action=JSON.parse(init.body).action;if(action==='save_article')return new Response('',{status:504});checks++;return Response.json(checks===3?{confirmed:true,article:{id:'saved-late',status:'published'}}:{confirmed:false});});
 const result=await api.call({api:'/test',token,action:'save_article',payload});assert.equal(checks,3);assert.equal(result.article.id,'saved-late');
});
test('installed save path no longer reads 500 unrelated rows, keeps authentication and confirmation',()=>{
 const source=readFileSync('netlify/functions/admin-articles.js','utf8'),save=source.slice(source.indexOf('async function saveArticle'),source.indexOf('exports.handler'));
 assert.doesNotMatch(save,/assertNoPublishedDuplicate/);assert.match(save,/saveManualArticle\(payload,input,actor,rest\)/);assert.match(source,/await authenticateAdmin/);assert.match(source,/action === "publication_status"/);
 assert.match(readFileSync('netlify/functions/_shared/supabase-admin.js','utf8'),/signal:AbortSignal.timeout\(timeoutMs\)/);
 const html=readFileSync('admin/index.html','utf8'),ui=readFileSync('admin/admin-publisher-v2.js','utf8');assert.match(html,/manual-publish-request.js\?v=20261009-publish-confirm-v2/);assert.match(ui,/uploadedCovers.get\(file\)/);assert.match(ui,/尚未提交/);
});
