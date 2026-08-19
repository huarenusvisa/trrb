#!/usr/bin/env node
import fs from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const failures=[];const checks=[];
function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'zh-CN',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
const page=await context.newPage();
const paths=['/','/important-news','/hot-headlines','/us-politics','/us-crime','/china-officialdom','/immigration','/asylum','/trump','/ice','/ice/news'];
for(const path of paths){
  const started=Date.now();
  const response=await page.goto(`${ORIGIN}${path}?node8=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null);
  await page.waitForTimeout(900);
  const elapsed=Date.now()-started;
  const m=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];const body=document.body;const interactive=[...document.querySelectorAll('a[href],button')].filter(el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'});return{dcl:n?.domContentLoadedEventEnd||0,load:n?.loadEventEnd||0,ttfb:n?.responseStart||0,width:body?.scrollWidth||0,viewport:innerWidth,interactive:interactive.length,text:(body?.innerText||'').slice(0,3000)}});
  record(response?.status()===200,`${path} 移动端HTTP 200`,`status=${response?.status()||0}`);
  record(m.width<=m.viewport+4,`${path} 移动端无横向溢出`,`${m.width}/${m.viewport}`);
  record(m.interactive>=3,`${path} 首屏具备可交互入口`,`interactive=${m.interactive}`);
  record(!/文章不存在|文章已下线/.test(m.text),`${path} 无错误文章状态`);
  record(m.ttfb>0&&m.ttfb<=4000,`${path} TTFB<=4秒`,`ttfb=${Math.round(m.ttfb)}ms`);
  record(m.dcl>0&&m.dcl<=8000,`${path} DOMContentLoaded<=8秒`,`dcl=${Math.round(m.dcl)}ms; wall=${elapsed}ms`);
}
await page.goto(`${ORIGIN}/?node8-menu=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForTimeout(1200);
const toggle=page.locator('.mobile-menu-toggle').first();
const toggleVisible=await toggle.isVisible().catch(()=>false);
record(toggleVisible,'首页移动菜单按钮可见');
if(toggleVisible){await toggle.click({timeout:10000}).catch(()=>{});await page.waitForTimeout(250);const expanded=await toggle.getAttribute('aria-expanded').catch(()=>null);const menuVisible=await page.locator('#site-navigation,.mobile-menu,.nav-menu,.mobile-nav').filter({visible:true}).count().catch(()=>0);record(expanded==='true'||menuVisible>0,'首页移动菜单可展开',`aria-expanded=${expanded||''}; visibleMenus=${menuVisible}`);}
const hero=page.locator('#hero a.hero-link,a.hero-link').first();
const heroVisible=await hero.isVisible().catch(()=>false);const heroHref=await hero.getAttribute('href').catch(()=>null);
record(heroVisible&&Boolean(heroHref)&&!/article\.html\?id=/i.test(heroHref||''),'首页Hero首屏链接可交互且使用pretty URL',heroHref||'');
await browser.close();
fs.writeFileSync('round13-node8-mobile-performance.json',JSON.stringify({generated_at:new Date().toISOString(),origin:ORIGIN,failures,checks},null,2)+'\n');
console.log(`ROUND13 NODE8 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}
console.log('ROUND13 NODE8 PASS: mobile first-screen speed and interaction performance verified');
