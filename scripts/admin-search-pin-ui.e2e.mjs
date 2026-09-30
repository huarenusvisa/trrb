import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('/tmp/admin-browser/node_modules/playwright/index.mjs');
const html=readFileSync('admin/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const css=readFileSync('admin/styles.css','utf8')+'\n'+readFileSync('admin/admin-publisher-v2.css','utf8');
const publisher=readFileSync('admin/admin-publisher-v2.js','utf8'),policy=readFileSync('article-pin-policy.js','utf8');
const browser=await chromium.launch({headless:true});mkdirSync('artifacts/admin-search-pin-ui',{recursive:true});const checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html);await page.addStyleTag({content:css});
  await page.evaluate(()=>{
   document.getElementById('login-view').classList.add('hidden');document.getElementById('admin-view').classList.remove('hidden');
   document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));document.getElementById('articles-page').classList.remove('hidden');
   document.getElementById('page-title').textContent='文章管理';document.getElementById('admin-info').textContent='隔离界面测试（不使用真实账号，不修改线上文章）';
   window.el=id=>document.getElementById(id);window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.escapeAttr=window.escapeHtml;
   window.formatDate=v=>v?new Date(v).toLocaleString('zh-CN'):'-';window.statusLabel=s=>({published:'已发布',draft:'草稿',hidden:'已隐藏'}[s]||s);
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'isolated-test-token'}}})}};
   window.uploadCoverImage=window.generateAiCover=window.handleSaveArticle=window.loadArticles=()=>{};
   window.__pinCalls=[];window.__lastList=null;
   const row={id:'a0000000-0000-4000-8000-000000000001',title:'任志强与倒习关键词测试文章',category_name:'中国热门头条',status:'published',visibility:'public',published_at:'2026-09-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z',metadata:{}};
   window.fetch=async(url,init)=>{
    const input=JSON.parse(init.body);
    if(input.action==='list'){window.__lastList=input;return Response.json({articles:input.status==='pinned'&&!row.homepage_pin_expires_at?[]:[structuredClone(row)],has_more:false,search_limited:false});}
    if(input.action==='pin'){
     window.__pinCalls.push(input);
     if(input.mode==='force'){row.homepage_pinned_at=new Date().toISOString();row.homepage_pin_expires_at=new Date(Date.now()+172800000).toISOString();row.metadata.homepage_focus_override='force';}
     else{row.homepage_pinned_at=null;row.homepage_pin_expires_at=null;row.metadata={};}
     return Response.json({message:input.mode==='force'?'已置顶，48小时后自动取消。':'已取消置顶，恢复自动推荐。',pin:{active:input.mode==='force',expires_at:row.homepage_pin_expires_at}});
    }
    throw new Error('Unexpected request '+input.action);
   };
  });
  await page.addScriptTag({content:policy});await page.addScriptTag({content:publisher});
  await page.evaluate(()=>{document.dispatchEvent(new Event('DOMContentLoaded'));return window.loadArticles();});
  await page.locator('#articles-search').fill('任志强');await page.locator('#articles-search-form button[type="submit"]').click();
  await page.waitForFunction(()=>window.__lastList?.q==='任志强');assert.match(await page.locator('#articles-list-note').innerText(),/全库搜索/);
  let accept=false;const prompts=[];page.on('dialog',async d=>{prompts.push(d.message());accept?await d.accept():await d.dismiss();});
  await page.getByRole('button',{name:'置顶48小时',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__pinCalls.length),0);assert.match(prompts[0],/48小时/);
  accept=true;await page.getByRole('button',{name:'置顶48小时',exact:true}).click();await page.getByRole('button',{name:'取消置顶',exact:true}).waitFor();
  await page.locator('#articles-status').selectOption('pinned');await page.waitForFunction(()=>window.__lastList?.status==='pinned');assert.match(await page.locator('#articles-list-note').innerText(),/不受72小时/);
  await page.locator('#articles-page').screenshot({path:`artifacts/admin-search-pin-ui/${width>700?'PC':'Mobile'}-pinned-filter.png`});
  await page.getByRole('button',{name:'取消置顶',exact:true}).click();await page.getByText('暂无文章。',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__pinCalls.length),2);assert.match(prompts.at(-1),/取消/);assert.equal(errors.length,0,errors.join('; '));
  checks.push({width,search_submitted:true,pin_confirmation:true,cancel_prompt_sends_no_request:true,pinned_filter:true,unpin_removes_from_filter:true});await page.close();
 }
 writeFileSync('artifacts/admin-search-pin-ui/results.json',JSON.stringify({passed:true,fixture_only:true,production_writes:0,checks},null,2));console.log(JSON.stringify({event:'admin-search-pin-ui',passed:true,checks}));
}finally{await browser.close();}
