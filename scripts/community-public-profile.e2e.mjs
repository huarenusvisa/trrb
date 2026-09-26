import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/tmp/community-browser/node_modules/playwright/index.mjs');
const base=process.env.COMMUNITY_TEST_ORIGIN || 'http://127.0.0.1:8123';
const guideUser='8e5569ee-86bf-4fc1-94a3-497d2657efb0',dynamicUser='07c2de9e-6231-4c97-9f7b-646aebb28cb2',guideId='588963ac-59bf-4f1c-bbf8-19e5743e3a77',dynamicId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const guide={id:guideId,user_id:guideUser,title:'年费缴纳操作指引（测试）',content:'测试正文第一段：这里有完整操作步骤。\n第二段：请打开 https://epay.eoir.justice.gov/ 查看。\n测试正文最后一段：内容没有丢失。',status:'published',category:'immigration_help',created_at:'2026-09-15T21:47:32Z',like_count:2,comment_count:0,profiles:{display_name:'测试指引作者',avatar_path:null}};
const dynamic={id:dynamicId,user_id:dynamicUser,caption:'中秋节，请喝杯奶茶\n这是一条测试动态，正文应能完整打开。',tags:['中秋'],status:'published',created_at:'2026-09-26T17:50:00Z',profiles:{display_name:'测试摄影作者',avatar_path:dynamicUser+'/avatar/test.jpg'},profile_post_media:[{id:'media',media_type:'image',storage_path:'test/image.jpg',width:800,height:1000,sort_order:0}]};
const profiles=[{id:guideUser,display_name:'测试指引作者',avatar_path:null,status:'active',is_private:false,bio:'分享指引'},{id:dynamicUser,display_name:'测试摄影作者',avatar_path:dynamicUser+'/avatar/test.jpg',status:'active',is_private:false,bio:'记录生活'}];
function installMock(){
  const fixture=window.__fixture;
  class Query{
    constructor(table){this.table=table;this.filters=[];this.a=0;this.b=29;this.one=false;}
    select(){return this;}
    eq(k,v){this.filters.push([k,v,false]);return this;}
    neq(k,v){this.filters.push([k,v,true]);return this;}
    not(){return this;}
    order(){return this;}
    limit(n){this.b=n-1;return this;}
    range(a,b){this.a=a;this.b=b;return this;}
    in(k,v){this.filters.push([k,v,'in']);return this;}
    maybeSingle(){this.one=true;return this;}
    single(){this.one=true;return this;}
    then(resolve,reject){
      window.__queries.push({table:this.table,filters:this.filters});
      let rows=fixture.tables[this.table]||[];
      rows=rows.filter(r=>this.filters.every(([k,v,op])=>op==='in'?v.includes(r[k]):op?r[k]!==v:r[k]===v));
      const data=this.one?(rows[0]||null):rows.slice(this.a,this.b+1);
      const error=this.table==='profile_post_comments'&&fixture.failComments?{message:'Simulated comment service unavailable'}:null;
      return Promise.resolve({data,count:rows.length,error}).then(resolve,reject);
    }
  }
  window.__queries=[];
  const storage={
    from(bucket){
      return {
        getPublicUrl:path=>({data:{publicUrl:'https://test-media.example/'+bucket+'/'+path}}),
        createSignedUrl:async path=>({data:{signedUrl:'https://test-media.example/'+bucket+'/'+path},error:null})
      };
    }
  };
  const auth={
    getSession:async()=>({data:{session:fixture.session}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
    signOut:async()=>{fixture.session=null;},
    setSession:async()=>({data:{session:fixture.session}})
  };
  window.supabaseClient={from:table=>new Query(table),auth,storage};
}
const image='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#e9e0d7"/><circle cx="400" cy="420" r="180" fill="#b2c7c7"/><text x="400" y="680" text-anchor="middle" font-size="48" fill="#344">TEST PHOTO</text></svg>';
const browser=await chromium.launch({headless:true});
const results=[];
mkdirSync('artifacts/community-profile',{recursive:true});
async function pageFor({session=null,failComments=false,privateProfile=false,viewport={width:1440,height:1000}}={}){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('Browser error:',error.message));
  const tableProfiles=structuredClone(profiles);
  if(privateProfile)tableProfiles[0].is_private=true;
  await page.addInitScript({content:'window.__fixture='+JSON.stringify({session,failComments,tables:{profiles:tableProfiles,community_posts:[guide],profile_posts:[dynamic],profile_post_comments:[],user_follows:[]}})+';'});
  await page.route('**/cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'/* Supabase SDK mocked; no external auth */'}));
  await page.route('**/assets/supabase-client.js*',route=>route.fulfill({contentType:'application/javascript',body:'('+installMock.toString()+')();'}));
  await page.route('https://test-media.example/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));
  await page.route('**/.netlify/functions/community-api*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,posts:[guide],comments:[],next_offset:null})}));
  return {page,context};
}
try{
  {
    const {page,context}=await pageFor();
    await page.goto(base+'/user/?id='+guideUser);
    await page.locator('.note-card[data-content-type="community"]').waitFor();
    assert.equal(await page.locator('#post-count').innerText(),'1 作品');
    assert.match(await page.locator('#profile-posts').innerText(),/年费缴纳操作指引/);
    assert.equal(await page.locator('#publish-dynamic').isVisible(),false);
    assert.equal(await page.locator('#owner-panel').count(),0);
    await page.screenshot({path:'artifacts/community-profile/public-guide-desktop.png',fullPage:true});
    await page.locator('.note-cover').click();
    await page.locator('#post-dialog[open]').waitFor();
    await page.getByText('测试正文最后一段：内容没有丢失。',{exact:false}).waitFor();
    assert.match(await page.locator('#post-detail').innerText(),/测试正文最后一段/);
    assert.equal(await page.locator('#post-detail a[href="https://epay.eoir.justice.gov/"]').count(),1);
    results.push('public guide is shown and opens complete body with usable link');
    await context.close();
  }
  {
    const {page,context}=await pageFor({failComments:true});
    await page.goto(base+'/community/');
    await page.locator('.note-card[data-content-type="profile"]').waitFor();
    await page.waitForFunction(()=>document.querySelector('.note-card[data-content-type="profile"] .social-avatar img')?.naturalWidth>0);
    assert.equal(await page.locator('.note-card[data-content-type="profile"] .social-avatar img').count(),1);
    await page.screenshot({path:'artifacts/community-profile/discovery-desktop.png',fullPage:true});
    await page.locator('.note-card[data-content-type="profile"] .note-cover').click();
    await page.locator('#post-detail-dialog[open]').waitFor();
    await page.getByText('评论暂时无法读取，正文不受影响。',{exact:false}).waitFor();
    assert.match(await page.locator('#post-detail-content').innerText(),/正文应能完整打开/);
    results.push('photo opens post; actual avatar rendered; comment error does not hide content');
    await context.close();
  }
  {
    const {page,context}=await pageFor({viewport:{width:390,height:844}});
    await page.goto(base+'/community/');await page.locator('.note-card').first().waitFor();
    assert.equal(await page.locator('#post-feed').evaluate(el=>getComputedStyle(el).columnCount),'2');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'artifacts/community-profile/discovery-mobile.png',fullPage:true});
    results.push('mobile shows two columns with no horizontal overflow');await context.close();
  }
  {
    const session={user:{id:dynamicUser},access_token:'test-only'};
    const {page,context}=await pageFor({session});
    await page.goto(base+'/user/center/?id='+guideUser);
    await page.locator('#owner-panel:not(.hidden)').waitFor();
    assert.match(await page.locator('#profile-name').innerText(),/测试摄影作者/);
    assert.equal(await page.locator('[data-edit-own-dynamic]').count(),1);
    assert.equal(await page.locator('#publish-dynamic').isVisible(),true);
    await page.screenshot({path:'artifacts/community-profile/owner-center.png',fullPage:true});
    await page.goto(base+'/user/?id='+dynamicUser);await page.locator('.note-card').waitFor();
    assert.equal(await page.locator('[data-edit-own-dynamic]').count(),0);
    assert.equal(await page.locator('#publish-dynamic').isVisible(),false);
    results.push('center ignores supplied author id and public own profile has no management controls');await context.close();
  }
  {
    const {page,context}=await pageFor();await page.goto(base+'/user/center/?id='+guideUser);
    await page.getByText('请先登录，个人中心只展示你自己的作品和本地草稿。').waitFor();
    assert.equal(await page.locator('.note-card').count(),0);
    results.push('signed-out center never reads another user works as owner');await context.close();
  }
  {
    const {page,context}=await pageFor({privateProfile:true});await page.goto(base+'/user/?id='+guideUser);
    await page.locator('#private-panel:not(.hidden)').waitFor();assert.equal(await page.locator('.note-card').count(),0);
    assert.equal(await page.evaluate(()=>window.__queries.some(q=>q.table==='community_posts')),false);
    results.push('private profile does not query or render works for a visitor');await context.close();
  }
  console.log(JSON.stringify({event:'community-profile-browser-verification',passed:results.length,results}));
  writeFileSync('artifacts/community-profile/results.json',JSON.stringify({passed:results.length,results},null,2));
}finally{await browser.close();}
