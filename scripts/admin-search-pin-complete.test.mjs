import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {listManagedArticles,setManagedArticlePin}=require('../netlify/functions/_shared/article-admin-actions.js');
const {listRequest,publicDatabaseError}=require('../netlify/functions/_shared/article-list-reader.js');
const {pinState,MAX_PIN_MS}=require('../article-pin-policy.js');
const id='a0000000-0000-4000-8000-000000000001';
const actor={user:{id:'b0000000-0000-4000-8000-000000000001'},admin:{role:'owner'}};
const row={id,title:'完整正文命中测试',category_name:'美国警情',status:'published',visibility:'public',created_at:'2020-01-01T00:00:00Z',published_at:'2020-01-01T00:00:00Z',metadata:{}};

test('admin keywords execute every UUID partition including content instead of one unbounded global scan',async()=>{
 const ranges=[],details=[];
 const result=await listManagedArticles({q:'倒习'},async(table,{query:q})=>{
  assert.equal(table,'articles');assert.match(q.and,/content\.ilike\.\*倒习\*/);assert.doesNotMatch(q.and,/published_at\.gte|created_at\.gte/);
  if(q.id?.startsWith('gte.')){ranges.push(q.id);return q.id.startsWith('gte.a')?[{id,published_at:row.published_at,created_at:row.created_at}]:[];}
  details.push(q);return [row];
 });
 assert.equal(ranges.length,16);assert.equal(new Set(ranges).size,16);assert.equal(details.length,1);
 assert.equal(result.search_limited,false);assert.equal(result.search_scope,'full_text_partitioned');assert.equal(result.articles[0].id,id);assert.equal(result.recent_hours,null);
 assert.equal(result.articles[0].category_label,'ICE执法与警情 · 美国警情');
});
test('ordinary list retains 72h default, but active pin list is not cut off by article publication date',()=>{
 const now=Date.parse('2026-09-30T04:00:00Z');
 assert.equal(listRequest({}, {now}).recent_hours,72);
 const pinned=listRequest({status:'pinned'},{now});
 assert.equal(pinned.query.and,undefined);assert.equal(pinned.query.status,'eq.published');assert.equal(pinned.query.visibility,'eq.public');
 assert.equal(pinned.query.homepage_pin_expires_at,'gt.2026-09-30T04:00:00.000Z');assert.equal(pinned.query['metadata->>homepage_focus_override'],'eq.force');assert.equal(pinned.recent_hours,null);
});
test('public search is published/public only even if client asks for drafts or pinned state',()=>{
 const {query}=listRequest({q:'任志强',status:'draft'},{publicOnly:true});
 assert.equal(query.status,'eq.published');assert.equal(query.visibility,'eq.public');assert.equal(query.hidden_at,'is.null');assert.equal(query.archived_at,'is.null');assert.doesNotMatch(query.select,/metadata|content|visibility/);
});
test('search failures never masquerade as a complete empty result',async()=>{
 const result=await listManagedArticles({q:'任志强'},async(_table,{query:q})=>{
  if(q.id?.startsWith('gte.'))throw new Error('statement timeout');
  assert.doesNotMatch(q.and,/content\.ilike/);return [row];
 });
 assert.equal(result.search_limited,true);assert.match(result.search_notice,/正文/);assert.equal(result.articles.length,1);
 await assert.rejects(()=>listManagedArticles({q:'任志强'},async()=>{throw new Error('statement timeout');}),/statement timeout/);
 assert.equal(publicDatabaseError(new Error('canceling statement due to statement timeout')).code,'SEARCH_TIMEOUT');
});
test('pin action uses only protected server-clock RPC and authenticated actor identity',async()=>{
 const now=Date.now(),started=new Date(now).toISOString(),expires=new Date(now+MAX_PIN_MS).toISOString();let calls=0;
 const result=await setManagedArticlePin({article_id:id,mode:'force',expires_at:'2099-01-01',actor:'attacker'},actor,async(resource,options)=>{
  calls++;assert.equal(resource,'rpc/trrb_set_homepage_pin');assert.equal(options.method,'POST');assert.deepEqual(options.body,{p_article_id:id,p_mode:'force',p_actor:actor.user.id});
  return [{...row,homepage_pinned_at:started,homepage_pin_expires_at:expires,metadata:{homepage_focus_override:'force'}}];
 });
 assert.equal(calls,1);assert.equal(result.pin.active,true);assert.equal(result.manual_pin_hours,48);assert.equal(result.pin.expires_at,expires);
});
test('unauthorized, invalid ID and invalid mode are rejected before any database mutation',async()=>{
 let calls=0;const rest=async()=>{calls++;return[];};
 await assert.rejects(()=>setManagedArticlePin({article_id:id,mode:'force'},null,rest),e=>e.statusCode===403);
 await assert.rejects(()=>setManagedArticlePin({article_id:'invalid',mode:'force'},actor,rest),e=>e.statusCode===400);
 await assert.rejects(()=>setManagedArticlePin({article_id:id,mode:'forever'},actor,rest),e=>e.statusCode===400);
 assert.equal(calls,0);
});
test('cancel clears manual priority without deleting or changing published status',async()=>{
 const result=await setManagedArticlePin({article_id:id,mode:'auto'},actor,async(_r,{body})=>{assert.equal(body.p_mode,'auto');return [row];});
 assert.equal(result.pin.active,false);assert.equal(result.article.status,'published');assert.match(result.message,/不会被删除/);
});
test('48h boundary, edited articles and hidden articles never retain expired priority',()=>{
 const start=Date.parse('2026-09-28T04:00:00Z');const pinned={...row,homepage_pinned_at:new Date(start).toISOString(),homepage_pin_expires_at:new Date(start+MAX_PIN_MS).toISOString(),updated_at:'2026-09-30T03:59:00Z',metadata:{homepage_focus_override:'force'}};
 assert.equal(pinState(pinned,start+MAX_PIN_MS-1).active,true);
 assert.equal(pinState(pinned,start+MAX_PIN_MS).active,false);
 assert.equal(pinState({...pinned,status:'draft'},start+1).active,false);
 assert.equal(pinState({...pinned,hidden_at:new Date(start).toISOString()},start+1).active,false);
 assert.equal(pinState({...pinned,homepage_pin_expires_at:'2099-01-01'},start+MAX_PIN_MS).active,false);
});
test('admin UI asks before pin and unpin; cancellation sends no request; pending clicks are deduplicated',async()=>{
 const source=readFileSync('admin/admin-publisher-v2.js','utf8');
 const a=source.indexOf('  window.setHomepageFocusMode ='),b=source.indexOf('  handleSaveArticle =',a);
 assert.ok(a>=0&&b>a);
 let allowed=false,calls=0,confirmed=[];const notice={textContent:''};
 const context={window:{confirm:message=>{confirmed.push(message);return allowed;}},articleRows:new Map([[id,row]]),pendingPinActions:new Set(),document:{querySelectorAll:()=>[]},el:()=>notice,publisherApi:async(action,payload)=>{calls++;assert.equal(action,'pin');return {message:'已保存',pin:{active:false}};},loadArticles:async()=>{},formatDate:v=>v};
 vm.runInNewContext(source.slice(a,b),context);
 await context.window.setHomepageFocusMode(id,'force');assert.equal(calls,0);assert.match(confirmed[0],/48小时/);
 allowed=true;await context.window.setHomepageFocusMode(id,'auto');assert.equal(calls,1);assert.match(confirmed[1],/取消/);
 context.pendingPinActions.add(id);await context.window.setHomepageFocusMode(id,'force');assert.equal(calls,1);
});
test('real admin dispatch routes through new list/pin handlers after authorization',()=>{
 const source=readFileSync('netlify/functions/admin-articles.js','utf8');
 assert.match(source,/return listManagedArticles\(input,rest\)/);
 assert.match(source,/action === "pin".*setManagedArticlePin\(input,actor,rest\)/);
 assert.ok(source.indexOf('const actor = await authenticateAdmin(event)')<source.indexOf('if (action === "pin")'));
 assert.match(readFileSync('admin/index.html','utf8'),/<option value="pinned">已置顶<\/option>/);
});
