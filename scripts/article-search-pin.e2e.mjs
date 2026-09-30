import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('/tmp/article-admin-browser/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true});
mkdirSync('artifacts/article-search-pin',{recursive:true});const checks=[];
const html=readFileSync('admin/index.html','utf8');
const section=html.match(/<section[^>]*id="articles-page"[\s\S]*?<\/section>/)?.[0];
assert.ok(section);
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.setContent(`<style>body{font:15px system-ui;padding:16px;margin:0}input,select,button{font:inherit;padding:9px;margin:4px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left}.hidden{display:none}.table-wrap{overflow:auto}small{color:#5c6878}button{cursor:pointer}button:disabled{cursor:not-allowed}#articles-pin-notice{color:#a21b26}</style><div id="count-articles"></div><div id="count-published"></div><div id="count-draft"></div>${section}`);
  await page.evaluate(()=>{
   document.getElementById('articles-page').classList.remove('hidden');
   window.uploadCoverImage=null;window.generateAiCover=null;window.loadArticles=null;window.handleSaveArticle=null;
   window.el=id=>document.getElementById(id);window.escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.escapeAttr=window.escapeHtml;window.formatDate=s=>new Date(s).toLocaleString('zh-CN');window.statusLabel=s=>({published:'已发布',draft:'草稿',hidden:'已隐藏'}[s]||s);
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'mock-test-only'}}})}};
   window.__readonly=false;window.__calls=[];
   window.__rows=[{id:'a71b7ec1-9a80-4e6f-8082-993859186bba',title:'任志强旧文 · 测试',category_name:'中国政治',status:'published',visibility:'public',published_at:'2026-09-27T16:56:50.243Z',metadata:{homepage_focus_override:'force',homepage_focus_updated_at:new Date(Date.now()-3600000).toISOString()}},{id:'eb8e118b-e28e-4d51-91e4-6e416587f5ac',title:'普通公开新闻 · 测试',category_name:'美国时政',status:'published',visibility:'public',published_at:'2026-09-29T16:00:00Z',metadata:{}}];
   window.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);window.__calls.push(body);
    if(body.action==='list'){
     const articles=window.__rows.filter(r=>(body.status!=='pinned'||window.TrrbArticlePins.isPinned(r))&&(!body.q||r.title.includes(body.q)));
     return Response.json({articles,page:body.page,has_more:false,search_limited:Boolean(body.q),search_notice:body.q?'当前按标题和摘要搜索全部历史文章；全文索引维护中，仅正文命中的文章可能暂未列出。':null});
    }
    if(body.action==='pin'){
     if(window.__readonly)return Response.json({error:'数据库当前处于只读保护状态，无法保存置顶或文章修改；当前内容未被更改。',code:'DATABASE_READ_ONLY'},{status:503});
     const row=window.__rows.find(r=>r.id===body.article_id);
     row.metadata=body.mode==='force'?{homepage_focus_override:'force',homepage_focus_updated_at:new Date().toISOString()}:body.mode==='exclude'?{homepage_focus_override:'exclude'}:{};
     return Response.json({article:row,message:body.mode==='force'?'已置顶，48小时后自动取消':'已取消置顶，恢复正常排序'});
    }
    throw new Error('Unexpected action');
   };
  });
  await page.addScriptTag({content:readFileSync('article-pin-policy.js','utf8')});
  await page.addScriptTag({content:readFileSync('admin/admin-publisher-v2.js','utf8')});
  await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
  await page.evaluate(()=>window.loadArticles());
  assert.equal(await page.getByRole('button',{name:'取消置顶',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'置顶48小时',exact:true}).count(),1);
  await page.selectOption('#articles-status','pinned');
  await page.waitForFunction(()=>document.querySelectorAll('#articles-tbody tr').length===1&&document.querySelector('#articles-tbody').innerText.includes('任志强'));
  assert.match(await page.locator('#articles-list-note').innerText(),/不受72小时/);
  await page.screenshot({path:`artifacts/article-search-pin/${width>760?'PC':'Mobile'}-pinned-filter.png`,fullPage:true});
  await page.getByRole('button',{name:'取消置顶',exact:true}).click();await page.getByText('已取消置顶，恢复正常排序',{exact:true}).waitFor();assert.match(await page.locator('#articles-tbody').innerText(),/暂无文章/);
  await page.selectOption('#articles-status','');await page.getByRole('button',{name:'置顶48小时',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'置顶48小时',exact:true}).first().click();await page.getByText('已置顶，48小时后自动取消',{exact:true}).waitFor();
  await page.evaluate(()=>window.__readonly=true);await page.getByRole('button',{name:'取消置顶',exact:true}).click();await page.getByText(/数据库当前处于只读保护状态/).waitFor();assert.equal(await page.getByRole('button',{name:'取消置顶',exact:true}).count(),1);
  await page.fill('#articles-search','任志强');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#articles-list-note').textContent.includes('全文索引维护中'));assert.match(await page.locator('#articles-tbody').innerText(),/任志强/);
  const calls=await page.evaluate(()=>window.__calls);assert.ok(calls.some(c=>c.action==='pin'&&c.mode==='auto'));assert.ok(calls.some(c=>c.action==='pin'&&c.mode==='force'));checks.push({width,pinned_filter:true,cancel:true,pin_48h:true,readonly_no_false_success:true,search_notice:true});await page.close();
 }
 console.log(JSON.stringify({event:'article-search-pin-browser-checks',checks,production_writes:0}));writeFileSync('artifacts/article-search-pin/result.json',JSON.stringify({checks,production_writes:0},null,2));
}finally{await browser.close();}
