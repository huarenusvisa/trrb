#!/usr/bin/env node
import { chromium } from 'playwright';

const ORIGIN='https://trrb.net';
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const headers={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
async function db(table, params){
  const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const r=await fetch(u,{headers});
  if(!r.ok) throw new Error(`${table} ${r.status} ${await r.text()}`);
  return r.json();
}
const cats=await db('categories',{select:'id,name,slug,is_active',name:'eq.热门头条',limit:'10'});
const rows=await db('articles',{select:'id,title,slug,category_id,category_name,topic_key,published_at,created_at',status:'eq.published',category_name:'eq.热门头条',order:'published_at.desc.nullslast,created_at.desc',limit:'20'});
console.log('CATEGORY_ROWS',JSON.stringify(cats));
console.log('DB_HOT_ROWS',JSON.stringify(rows.map(x=>({id:x.id,title:x.title,slug:x.slug,topic_key:x.topic_key,category_id:x.category_id}))));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1365,height:900},locale:'zh-CN'});
await page.goto(`${ORIGIN}/hot-headlines`,{waitUntil:'domcontentloaded',timeout:20000});
await page.waitForTimeout(5000);
const diag=await page.evaluate(async ({SUPABASE_URL,KEY})=>{
  let wrapped=[];
  try {
    if(typeof window.fetchLivePublishedArticles==='function') {
      wrapped=(await window.fetchLivePublishedArticles(30)).map(x=>({id:x.id,title:x.title,category:x.category,slug:x.slug,topicKey:x.topicKey}));
    }
  } catch(e) { wrapped=[{error:String(e)}]; }
  let direct=[];
  try {
    const u=new URL(`${SUPABASE_URL}/rest/v1/articles`);
    u.searchParams.set('select','id,title,slug,category_name,topic_key,published_at,created_at');
    u.searchParams.set('status','eq.published');
    u.searchParams.set('category_name','eq.热门头条');
    u.searchParams.set('order','published_at.desc.nullslast,created_at.desc');
    u.searchParams.set('limit','30');
    const r=await fetch(u,{cache:'no-store',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'}});
    direct=await r.json();
  } catch(e) { direct=[{error:String(e)}]; }
  const cards=[...document.querySelectorAll('#listing-grid .archive-card')].slice(0,30).map(card=>({
    title:(card.querySelector('h2')?.textContent||'').replace(/\s+/g,' ').trim(),
    category:(card.querySelector('span')?.textContent||'').trim(),
    href:card.querySelector('a')?.href||''
  }));
  return {
    pathname:location.pathname,
    title:document.querySelector('#listing-title')?.textContent||'',
    liveCategory:document.documentElement.dataset.trrbLiveCategory||'',
    liveCategoryCount:document.documentElement.dataset.trrbLiveCategoryCount||'',
    wrapped,
    direct,
    cards
  };
},{SUPABASE_URL,KEY});
console.log('PAGE_DIAG',JSON.stringify(diag));
await browser.close();
