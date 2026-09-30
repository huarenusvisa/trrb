import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const pins=require('../article-pin-policy.js');
const {listRequest,readArticleList,publicDatabaseError}=require('../netlify/functions/_shared/article-list-reader.js');
const start=Date.parse('2026-09-27T16:59:44.726Z');
const make=(changes={})=>({id:'a71b7ec1-9a80-4e6f-8082-993859186bba',status:'published',visibility:'public',published_at:'2026-09-27T16:56:50.243Z',metadata:{homepage_focus_override:'force',homepage_focus_updated_at:new Date(start).toISOString()},...changes});

test('manual pin is active before 48 hours and inactive at the exact boundary',()=>{
 assert.equal(pins.isPinned(make(),start+pins.MAX_PIN_MS-1),true);
 assert.equal(pins.isPinned(make(),start+pins.MAX_PIN_MS),false);
 assert.equal(pins.pinState(make(),start+pins.MAX_PIN_MS).mode,'auto');
});
test('ordinary updates and arbitrarily extended timestamps never renew a pin',()=>{
 const row=make({updated_at:'2026-09-30T00:00:00Z',homepage_pin_expires_at:'2027-01-01T00:00:00Z'});
 assert.equal(pins.pinState(row,start).expires_at,new Date(start+pins.MAX_PIN_MS).toISOString());
 assert.equal(pins.isPinned(row,start+pins.MAX_PIN_MS+1),false);
});
test('missing clocks, future starts, unpublished and hidden content fail closed',()=>{
 assert.equal(pins.isPinned(make({metadata:{homepage_focus_override:'force'}}),start),false);
 assert.equal(pins.isPinned(make(),start-1),false);
 for(const changes of [{status:'draft'},{status:'hidden'},{visibility:'private'},{hidden_at:new Date(start).toISOString()},{archived_at:new Date(start).toISOString()},{published_at:new Date(start+1000).toISOString()}])assert.equal(pins.isPinned(make(changes),start),false);
});
test('explicit unpin and exclude are distinct and both lose manual priority',()=>{
 assert.equal(pins.pinState(make({metadata:{}}),start).mode,'auto');
 assert.equal(pins.pinState(make({metadata:{homepage_focus_override:'exclude'}}),start).mode,'exclude');
});
test('pinned-only filter is effective-time based and does not hide old articles using 72-hour cutoff',()=>{
 const spec=listRequest({status:'pinned'},{now:start,indexReady:false});
 assert.equal(spec.query.and,undefined);assert.equal(spec.recent_hours,null);
 assert.equal(spec.query.homepage_pin_expires_at,'gt.'+new Date(start).toISOString());
 assert.equal(spec.query.status,'eq.published');assert.equal(spec.query.visibility,'eq.public');
 assert.equal(spec.query['metadata->>homepage_focus_override'],'eq.force');
 assert.match(spec.query.select,/homepage_pin_expires_at/);
});
test('maintenance does not silently use a partly filled index or call a global full-body scan',()=>{
 for(const q of ['任志强','倒习','婚姻 绿卡']){
  const spec=listRequest({q},{indexReady:false});assert.equal(spec.resource,'articles');assert.equal(spec.search_scope,'title_summary');assert.equal(spec.search_limited,true);assert.match(spec.search_notice,/仅正文命中/);assert.doesNotMatch(spec.query.and,/content\./);assert.match(spec.query.and,/title\.ilike/);assert.equal(spec.recent_hours,null);
 }
});
test('fully verified index opt-in uses bound RPC arguments and safe public projection',()=>{
 const spec=listRequest({q:'倒习',status:'hidden'},{publicOnly:true,indexReady:true,now:start});
 assert.equal(spec.resource,'rpc/trrb_search_articles_v2');assert.equal(spec.options.method,'POST');assert.equal(spec.options.body.p_public_only,true);assert.deepEqual(spec.options.body.p_terms,['倒习']);assert.doesNotMatch(spec.options.query.select,/metadata|content|visibility/);assert.equal(spec.search_limited,false);
});
test('public query always excludes drafts, private, withdrawn and future publications',()=>{
 const spec=listRequest({q:'任志强',status:'pinned'},{publicOnly:true,indexReady:false,now:start});
 assert.equal(spec.query.status,'eq.published');assert.equal(spec.query.visibility,'eq.public');assert.equal(spec.query.hidden_at,'is.null');assert.equal(spec.query.archived_at,'is.null');assert.match(spec.query.or,/published_at.lte/);assert.equal(spec.pinnedOnly,false);
});
test('UUID and invalid searches preserve exact lookup and empty behavior',async()=>{
 const exact=listRequest({q:make().id},{indexReady:false});assert.equal(exact.query.id,'eq.'+make().id);assert.equal(exact.search_limited,false);assert.equal(exact.query.and,undefined);
 let called=false;const result=await readArticleList({q:'***%'},{publicOnly:true},async()=>{called=true;return [];});assert.equal(called,false);assert.deepEqual(result.articles,[]);
});
test('list response returns pagination, pin state and explicit maintenance notice',async()=>{
 const result=await readArticleList({q:'倒习',page_size:2},{now:start,indexReady:false},async()=>[make(),make({id:'b'}),make({id:'c'})]);
 assert.equal(result.articles.length,2);assert.equal(result.has_more,true);assert.equal(result.articles[0].pin.active,true);assert.equal(result.search_limited,true);
});
test('read-only and timeout errors cannot be mistaken for successful saves or no results',()=>{
 assert.equal(publicDatabaseError(new Error('cannot execute UPDATE in a read-only transaction')).code,'DATABASE_READ_ONLY');
 assert.match(publicDatabaseError(new Error('canceling statement due to statement timeout')).message,/不代表文章不存在/);
 assert.equal(publicDatabaseError(new Error('other')),null);
});
test('integrated admin uses authenticated pin API, explicit cancel and visible pinned filter',()=>{
 const ui=readFileSync('admin/admin-publisher-v2.js','utf8'),html=readFileSync('admin/index.html','utf8'),backend=readFileSync('netlify/functions/admin-articles.js','utf8');
 assert.match(html,/<option value="pinned">已置顶<\/option>/);assert.match(html,/article-pin-policy.js/);assert.match(ui,/取消置顶/);assert.match(ui,/置顶48小时/);assert.match(ui,/publisherApi\('pin'/);
 const setter=ui.slice(ui.indexOf('window.setHomepageFocusMode ='),ui.indexOf('handleSaveArticle ='));assert.doesNotMatch(setter,/\.from\("articles"\)/);
 assert.match(backend,/await authenticateAdmin/);assert.match(backend,/trrb_set_homepage_pin/);assert.match(backend,/publicDatabaseError/);
});

test('homepage honors active old pin and removes expired pin from noneligible category',async t=>{
 process.env.SUPABASE_URL='https://pin-policy.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-placeholder';
 const {default:handler}=await import('../netlify/functions/public-home-focus.ts');
 const now=Date.parse('2026-09-30T06:00:00Z');t.mock.method(Date,'now',()=>now);
 const common={status:'published',visibility:'public',hidden_at:null,archived_at:null,content:'中'.repeat(2200),cover_image:'https://example.test/cover.jpg',summary:'测试',rank_score:0};
 const active={...common,id:'active',title:'测试有效置顶',category_name:'中国政治',published_at:'2026-09-20T00:00:00Z',metadata:{homepage_focus_override:'force',homepage_focus_updated_at:new Date(now-3600000).toISOString()},homepage_pinned_at:new Date(now-3600000).toISOString(),homepage_pin_expires_at:new Date(now+47*3600000).toISOString()};
 const expired={...active,id:'expired',title:'测试过期置顶',published_at:'2026-09-29T00:00:00Z',metadata:{homepage_focus_override:'force',homepage_focus_updated_at:new Date(now-48*3600000).toISOString()},homepage_pinned_at:new Date(now-48*3600000).toISOString(),homepage_pin_expires_at:new Date(now).toISOString()};
 const regular={...common,id:'regular',title:'测试国会政策',category_name:'美国时政',published_at:'2026-09-30T05:00:00Z',metadata:{}};
 t.mock.method(globalThis,'fetch',async()=>Response.json([active,expired,regular]));
 const response=await handler(new Request('https://trrb.test/.netlify/functions/public-home-focus'));assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.articles[0].id,'active');assert.ok(!result.articles.some(a=>a.id==='expired'));assert.equal(result.manual_pin_hours,48);
});
