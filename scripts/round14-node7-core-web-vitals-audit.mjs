#!/usr/bin/env node
import fs from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const checks=[];const failures=[];
function record(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
  viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'zh-CN',
  userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'
});
const page=await context.newPage();
await page.addInitScript(()=>{
  window.__r14={lcp:0,cls:0,longTask:0};
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__r14.lcp=Math.max(window.__r14.lcp,e.startTime||0);}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__r14.cls+=(e.value||0);}).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__r14.longTask+=Math.max(0,(e.duration||0)-50);}).observe({type:'longtask',buffered:true});}catch{}
});

const paths=['/','/important-news','/hot-headlines','/us-politics','/ice'];
const results=[];
for(const path of paths){
  const response=await page.goto(`${ORIGIN}${path}?r14n7=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null);
  await page.waitForTimeout(2200);
  const metric=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0];
    return {status:document.readyState,ttfb:nav?.responseStart||0,dcl:nav?.domContentLoadedEventEnd||0,load:nav?.loadEventEnd||0,lcp:window.__r14?.lcp||0,cls:window.__r14?.cls||0,longTask:window.__r14?.longTask||0,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  let interactionMs=null;
  if(path==='/'){
    const button=page.locator('.mobile-menu-toggle').first();
    if(await button.isVisible().catch(()=>false)){
      const started=Date.now();
      await button.click({timeout:5000}).catch(()=>{});
      await page.waitForFunction(()=>document.querySelector('.mobile-menu-toggle')?.getAttribute('aria-expanded')==='true',{timeout:3000}).catch(()=>{});
      interactionMs=Date.now()-started;
    }
  }
  results.push({path,...metric,interactionMs,statusCode:response?.status()||0});
  record(response?.status()===200,`${path} 生产页面HTTP 200`,`status=${response?.status()||0}`);
  record(metric.ttfb>0&&metric.ttfb<=1000,`${path} TTFB<=1秒`,`ttfb=${Math.round(metric.ttfb)}ms`);
  record(metric.lcp>0&&metric.lcp<=2500,`${path} LCP<=2.5秒`,`lcp=${Math.round(metric.lcp)}ms`);
  record(metric.cls<=0.1,`${path} CLS<=0.10`,`cls=${metric.cls.toFixed(4)}`);
  record(metric.longTask<=300,`${path} 主线程长任务阻塞<=300ms`,`blocking=${Math.round(metric.longTask)}ms`);
  record(metric.scrollWidth<=metric.viewport+4,`${path} 移动端无横向溢出`,`${metric.scrollWidth}/${metric.viewport}`);
  if(interactionMs!==null)record(interactionMs<=200,'首页菜单合成交互响应<=200ms',`interaction=${interactionMs}ms`);
}

const avgLcp=results.reduce((s,x)=>s+x.lcp,0)/Math.max(1,results.length);
const maxCls=Math.max(...results.map(x=>x.cls));
record(avgLcp<=2200,'核心页面平均LCP<=2.2秒',`avg=${Math.round(avgLcp)}ms`);
record(maxCls<=0.1,'核心页面最大CLS<=0.10',`max=${maxCls.toFixed(4)}`);

await browser.close();
fs.writeFileSync('round14-node7-core-web-vitals-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,results,checks,failures},null,2)+'\n');
console.log(`ROUND14 NODE7 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){console.log('ROUND14 NODE7 FAIL: Core Web Vitals production issues detected');process.exit(1);}
console.log('ROUND14 NODE7 PASS: Core Web Vitals deep production performance verified');
