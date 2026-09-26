import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),policy=require('../assets/community-media-policy.js');
const {chromium}=await import('/tmp/community-browser/node_modules/playwright/index.mjs');
const origin='http://127.0.0.1:8123',uid='11111111-1111-4111-8111-111111111111';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA2kAAAAASUVORK5CYII=','base64');
const photo=name=>({name,mimeType:'image/png',buffer:png});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#eef2f3"/><circle cx="400" cy="400" r="200" fill="#c5d4d9"/><text x="400" y="750" text-anchor="middle" font-size="42">MEDIA TEST</text></svg>';
function mockClient(){
 window.__uploads=[];window.__removals=[];
 const session={user:{id:'11111111-1111-4111-8111-111111111111'},access_token:'test-only'};
 class Q {constructor(t){this.t=t;}select(){return this;}eq(){return this;}order(){return this;}limit(){return this;}in(){return this;}then(a,b){return Promise.resolve({data:[],error:null}).then(a,b);}}
 window.supabaseClient={from:t=>new Q(t),auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({}),signOut:async()=>({})},storage:{from:bucket=>({
 upload:async(path,file)=>{window.__uploads.push({bucket,path,size:file.size,type:file.type});return {data:{path},error:null};},
 remove:async paths=>{window.__removals.push(...paths);return {data:[],error:null};},
 createSignedUrl:async path=>({data:{signedUrl:'https://test-media.example/'+path},error:null}),
 getPublicUrl:path=>({data:{publicUrl:'https://test-media.example/'+path}})
 })}};
}
const browser=await chromium.launch({headless:true});mkdirSync('artifacts/simple-community',{recursive:true});const results=[];
async function setup({width=1440,loseResponse=false}={}){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
 const posts=[];let creates=0,lost=false;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'/* mocked SDK */'}));
 await page.route('**/assets/supabase-client.js*',r=>r.fulfill({contentType:'application/javascript',body:'('+mockClient.toString()+')();'}));
 await page.route('https://test-media.example/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.route('**/.netlify/functions/community-api*',async r=>{
   const req=r.request(),url=new URL(req.url());
   if(req.method()==='GET'){const id=url.searchParams.get('post_id');return r.fulfill({contentType:'application/json',body:JSON.stringify({posts:id?posts.filter(p=>p.id===id):posts,comments:[],next_offset:null})});}
   const body=req.postDataJSON();assert.equal(body.action,'create_post');creates++;
   assert.equal(body.composer_version,'simple-media-v1');assert.equal(body.title,undefined);assert.equal(body.content_label,undefined);assert.equal(body.agency_office,undefined);
   const normalized=policy.normalizeSimplePost(body,uid);const existing=posts.find(p=>p.id===normalized.id);
   const post=existing||{...normalized,user_id:uid,category:body.category,status:'published',created_at:new Date().toISOString(),like_count:0,comment_count:0,profiles:{display_name:'测试用户'}};
   if(!existing)posts.unshift(post);
   if(loseResponse&&!lost){lost=true;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟响应丢失，请重试'})});}
   return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,post,profile:post.profiles,message:'发布成功'})});
 });
 await page.goto(origin+'/community/');await page.waitForFunction(()=>document.querySelector('#account-label')?.textContent==='已登录');await page.locator('#publish-open').click();
 return {page,context,posts,errors,getCreates:()=>creates};
}
try{
 {
  const t=await setup(),{page}=t;
  assert.equal(await page.locator('#composer-form select').count(),1);
  assert.equal(await page.locator('#post-title,#post-label,#structured-fields,#privacy-confirm').count(),0);
  await page.locator('#post-content').fill('这是新的简单发布测试');
  await page.locator('#community-images').setInputFiles([photo('第一张.png'),photo('第二张.png')]);
  assert.equal(await page.locator('.compose-media-preview').count(),2);
  assert.equal(await page.evaluate(()=>window.__uploads.length),0,'Choosing media is not a cloud draft/upload');
  await page.screenshot({path:'artifacts/simple-community/PC-simple-composer.png',fullPage:true});
  await page.locator('#community-publish-submit').click();await page.locator('#composer-dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__uploads.length),2);assert.equal(t.posts.length,1);
  await page.locator('.note-card[data-content-type="community"] .note-cover img').waitFor();
  await page.locator('.note-card .note-cover').click();await page.locator('#post-dialog .detail-gallery').waitFor();
  assert.equal(await page.locator('#post-dialog .detail-slide').count(),2);
  const a=await page.locator('#post-dialog .detail-gallery').boundingBox(),b=await page.locator('#post-dialog .detail-content-panel').boundingBox();assert.ok(b.x>a.x+a.width-2);
  await page.locator('#post-dialog [aria-label="下一张"]').click();assert.equal(await page.locator('#post-dialog .detail-gallery').getAttribute('data-active-index'),'1');
  assert.deepEqual(t.errors,[]);results.push('PC simple form publishes images; feed and existing left/right carousel render both');await t.context.close();
 }
 {
  const t=await setup({loseResponse:true}),{page}=t;
  await page.locator('#post-content').fill('输入的文字不要丢失');
  await page.locator('#community-video').setInputFiles({name:'超限.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(12582913)});
  await page.getByText('视频不能超过 12 MB，请压缩后重新选择').waitFor();assert.equal(await page.evaluate(()=>window.__uploads.length),0);
  assert.equal(await page.locator('#post-content').inputValue(),'输入的文字不要丢失');assert.equal(await page.locator('.compose-media-preview').count(),0);
  await page.locator('#community-video').setInputFiles({name:'小视频.mp4',mimeType:'video/mp4',buffer:Buffer.from('0000ftypisom-video-test')});
  await page.locator('#community-publish-submit').click();await page.getByText('模拟响应丢失，请重试').waitFor();
  assert.equal(await page.locator('.compose-media-preview').count(),1);assert.equal(t.posts.length,1);
  await page.locator('#community-publish-submit').click();await page.locator('#composer-dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__uploads.length),1);assert.equal(t.getCreates(),1);assert.equal(t.posts.length,1);
  results.push('12 MiB+1 is rejected before upload; lost-response retry does not duplicate upload/post or discard caption');await t.context.close();
 }
 {
  const t=await setup({width:390}),{page}=t;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#community-publish-submit').click();await page.getByText('请填写正文，或选择图片／视频').waitFor();assert.equal(t.getCreates(),0);
  await page.locator('#community-images').setInputFiles(photo('仅图片.png'));
  await page.screenshot({path:'artifacts/simple-community/Mobile-simple-composer.png',fullPage:true});
  await page.locator('#community-publish-submit').click();await page.locator('#composer-dialog').waitFor({state:'hidden'});
  assert.equal(t.posts[0].content,'');assert.equal(t.posts[0].title,'分享图片');
  await page.locator('.note-card .note-cover').click();await page.locator('#post-dialog .detail-gallery').waitFor();
  const a=await page.locator('#post-dialog .detail-gallery').boundingBox(),b=await page.locator('#post-dialog .detail-content-panel').boundingBox();assert.ok(b.y>=a.y+a.height-2);
  results.push('Mobile needs no extra fields; image-only post uses the existing image-above-body detail');await t.context.close();
 }
 {
  const t=await setup(),{page}=t;await page.locator('#post-content').fill('好');await page.locator('#community-publish-submit').click();await page.locator('#composer-dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__uploads.length),0);assert.equal(t.posts[0].content,'好');assert.equal(t.posts.length,1);results.push('Text-only publishing works without title or 20-character minimum');await t.context.close();
 }
 console.log(JSON.stringify({event:'simple-community-browser-verification',passed:results.length,results}));
 writeFileSync('artifacts/simple-community/results.json',JSON.stringify({passed:results.length,results},null,2));
}finally{await browser.close();}
