import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('/tmp/publisher-browser/node_modules/playwright/index.mjs');
const html=readFileSync('admin/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const browser=await chromium.launch({headless:true});mkdirSync('artifacts/manual-publish-504',{recursive:true});const checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1050}});
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('https://publisher-isolated.test/');
  await page.addStyleTag({content:readFileSync('admin/styles.css','utf8')+'\n'+readFileSync('admin/admin-publisher-v2.css','utf8')});
  await page.evaluate(()=>{
   window.el=id=>document.getElementById(id);el('login-view').classList.add('hidden');el('admin-view').classList.remove('hidden');document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));el('new-article-page').classList.remove('hidden');document.body.classList.add('publisher-mode');el('page-title').textContent='发布文章 · 隔离故障回归';
   window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.escapeAttr=window.escapeHtml;window.formatDate=v=>v||'';window.statusLabel=s=>({published:'已发布',draft:'草稿',hidden:'已隐藏'}[s]||s);
   const token='test.'+btoa(JSON.stringify({sub:'10000000-0000-4000-8000-000000000001'}))+'.signature';window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:token}}})}};
   window.loadArticles=window.uploadCoverImage=window.generateAiCover=window.handleSaveArticle=()=>{};
   window.showPage=()=>{};window.clearCoverSelection=()=>{window.selectedCoverFile=null;};window.optimizeImage=async()=>new Blob(['test-only'],{type:'image/webp'});
   window.selectedCoverFile=new File(['test-only'],'fixture.webp',{type:'image/webp'});
   window.__mode='cover-error';window.__calls=[];
   window.fetch=async(url,init)=>{
    const input=JSON.parse(init.body);window.__calls.push(input);
    if(input.action==='upload_cover')return window.__mode==='cover-error'?new Response('',{status:504}):Response.json({url:'https://publisher-isolated.test/cover.webp'});
    if(input.action==='save_article')return window.__mode==='retry-success'?Response.json({confirmed:true,article:{id:'saved',status:'published',visibility:'public'},replayed:true}):new Response('',{status:504});
    if(input.action==='publication_status')return Response.json(window.__mode==='saved-response-lost'?{confirmed:true,article:{id:'saved',status:'published',visibility:'public'},replayed:true}:{confirmed:false});
    if(input.action==='list')return Response.json({articles:[]});
    if(input.action==='suggest_titles')return Response.json({titles:['隔离测试标题一','隔离测试标题二','隔离测试标题三']});
    throw new Error('Unexpected action '+input.action);
   };
   el('article-category').innerHTML='<option value="">美国时政</option>';el('article-title').value='发布故障回归测试，不会实际发布';el('article-content').value='这是一段隔离测试正文，用于检查超时后是否完整保留。';el('article-author').value='Test';
  });
  for(const file of ['article-pin-policy.js','admin/manual-publish-request.js','admin/admin-publisher-v2.js'])await page.addScriptTag({content:readFileSync(file,'utf8')});
  const submit=()=>page.evaluate(()=>window.handleSaveArticle({preventDefault(){}}));
  await submit();assert.match(await page.locator('#article-message').innerText(),/封面上传超时/);assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='save_article').length),0);assert.match(await page.locator('#article-content').inputValue(),/完整保留/);
  await page.evaluate(()=>{window.__mode='save-error';window.__calls=[];});
  await submit();assert.match(await page.locator('#article-message').innerText(),/尚未确认/);assert.equal(await page.locator('#article-submit').isDisabled(),false);assert.match(await page.locator('#article-content').inputValue(),/完整保留/);
  await page.locator('#new-article-page').screenshot({path:`artifacts/manual-publish-504/${width>700?'PC':'Mobile'}-retained-after-504.png`});
  await page.evaluate(()=>window.__mode='retry-success');await submit();
  const savedCalls=await page.evaluate(()=>window.__calls);assert.equal(savedCalls.filter(c=>c.action==='upload_cover').length,1);const writes=savedCalls.filter(c=>c.action==='save_article');assert.equal(writes.length,2);assert.equal(writes[0].request_id,writes[1].request_id);assert.match(await page.locator('#article-message').innerText(),/已核实文章保存成功/);assert.equal(await page.locator('#article-content').inputValue(),'');
  await page.evaluate(()=>{el('article-title').value='第二条隔离测试';el('article-content').value='另一条正文';window.__mode='saved-response-lost';});await submit();assert.match(await page.locator('#article-message').innerText(),/已核实文章保存成功/);
  checks.push({width,cover_failure_distinct:true,body_retained:true,retry_reuses_request:true,cover_uploaded_once:true,lost_success_reconciled:true,production_writes:0});await page.close();
 }
 writeFileSync('artifacts/manual-publish-504/results.json',JSON.stringify({passed:true,checks,fixture_only:true},null,2));console.log(JSON.stringify({event:'manual-publish-browser-verified',passed:true,checks}));
}finally{await browser.close();}
