(function(){
  if(window.__financeNavigationMemoryLoaded)return;window.__financeNavigationMemoryLoaded=true;
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const STATE_KEY='trfinance.navState';const CONTEXT_KEY='trfinance.navContext';
  const validPages=['market','watch','funds','profile'];const isDetail=!!$('.stock-app');const qaSandbox=new URLSearchParams(location.search).get('qaEmbed')==='1';
  const read=(key,fallback={})=>{try{return JSON.parse(sessionStorage.getItem(key)||JSON.stringify(fallback))}catch(e){return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch(e){}};
  const currentPage=()=>{if(isDetail)return null;const p=$('.page.active')?.dataset.page||location.hash.slice(1)||'market';return validPages.includes(p)?p:'market'};
  function selectionState(){return {marketPanel:$('.market-tab.on')?.dataset.panel||'now',watchFilter:$('.watch-filter.on')?.dataset.filter||'all',fundFilter:$('.fund-cat.on')?.dataset.fundFilter||'all'}}
  function saveSelections(){const page=currentPage();if(!page)return;write(STATE_KEY,{...read(STATE_KEY,{}),...selectionState(),page,ts:Date.now()})}
  let restoreDepth=0;
  function withRestoreSilence(fn){restoreDepth++;window.__financeRestoringNavigation=true;try{return fn()}finally{requestAnimationFrame(()=>{restoreDepth=Math.max(0,restoreDepth-1);if(!restoreDepth)window.__financeRestoringNavigation=false})}}
  function clickIfNeeded(selector,desired,attr){
    if(!desired)return;
    if(desired==='all'&&attr==='data-fund-filter'){const active=$(`${selector}.on`);if(active)active.click();return}
    const target=$(`${selector}[${attr}="${desired}"]`);if(!target)return;
    const active=target.classList.contains('on')||target.getAttribute('aria-pressed')==='true'||target.getAttribute('aria-selected')==='true';if(!active)target.click();
  }
  function restoreSelections(state){if(!state||isDetail)return;withRestoreSilence(()=>{clickIfNeeded('.market-tab',state.marketPanel,'data-panel');clickIfNeeded('.watch-filter',state.watchFilter,'data-filter');clickIfNeeded('.fund-cat',state.fundFilter||'all','data-fund-filter')})}
  let lastSavedY=-1,lastScrollWriteAt=0,scrollTimer=0,pendingScrollY=0;
  function captureContext(link){
    if(isDetail||!link)return;const href=link.getAttribute('href')||'';if(!/(?:stock|fund)\.html\?/i.test(href))return;
    const page=currentPage();if(!page)return;const y=Math.max(0,Math.round(window.scrollY||0));lastSavedY=y;
    const ctx={page,scrollY:y,...selectionState(),href,ts:Date.now(),restore:false};write(CONTEXT_KEY,ctx);saveSelections();
  }
  function markReturn(){const ctx=read(CONTEXT_KEY,null);if(ctx&&Date.now()-ctx.ts<30*60*1000){ctx.restore=true;ctx.ts=Date.now();write(CONTEXT_KEY,ctx);return ctx}return null}
  function clearContext(){try{sessionStorage.removeItem(CONTEXT_KEY)}catch(e){}}
  window.FinanceNavigationMemory={getContext:()=>read(CONTEXT_KEY,null),markReturn,clearContext,isRestoring:()=>!!window.__financeRestoringNavigation};
  if(isDetail)return;

  function flushScroll(force=false){
    if(scrollTimer){clearTimeout(scrollTimer);scrollTimer=0}const page=currentPage(),ctx=read(CONTEXT_KEY,null);if(!ctx||!page||ctx.page!==page||ctx.restore)return;
    const y=Math.max(0,Math.round(force?(window.scrollY||0):pendingScrollY)),now=Date.now();
    if(!force&&lastSavedY>=0&&Math.abs(y-lastSavedY)<12&&now-lastScrollWriteAt<500)return;
    ctx.scrollY=y;ctx.ts=now;write(CONTEXT_KEY,ctx);lastSavedY=y;lastScrollWriteAt=now;
  }
  function scheduleScrollSave(){pendingScrollY=Math.max(0,Math.round(window.scrollY||0));if(scrollTimer)return;scrollTimer=setTimeout(()=>flushScroll(false),120)}

  document.addEventListener('click',e=>{
    const detailLink=e.target.closest('a[href*="stock.html?"],a[href*="fund.html?"]');if(detailLink)captureContext(detailLink);
    if(e.target.closest('.market-tab,.watch-filter,.fund-cat,.bottom button'))requestAnimationFrame(saveSelections);
  },true);
  window.addEventListener('scroll',scheduleScrollSave,{passive:true});
  window.addEventListener('pagehide',()=>{if(qaSandbox){if(scrollTimer){clearTimeout(scrollTimer);scrollTimer=0}return}flushScroll(true);saveSelections()});
  function restoreContext(forceBack=false){
    const state=read(STATE_KEY,{});restoreSelections(state);const ctx=read(CONTEXT_KEY,null);if(!ctx)return;
    const nav=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0],backForward=forceBack||!!(nav&&nav.type==='back_forward');
    if(!(ctx.restore||backForward)||Date.now()-ctx.ts>30*60*1000)return;
    if(validPages.includes(ctx.page)&&currentPage()!==ctx.page){const btn=$(`.bottom button[data-target="${ctx.page}"]`);if(btn)withRestoreSilence(()=>btn.click())}
    lastSavedY=Math.max(0,ctx.scrollY||0);requestAnimationFrame(()=>{restoreSelections(ctx);requestAnimationFrame(()=>window.scrollTo({top:lastSavedY,behavior:'auto'}))});
    ctx.restore=false;ctx.ts=Date.now();write(CONTEXT_KEY,ctx);
  }
  window.addEventListener('pageshow',e=>setTimeout(()=>restoreContext(!!e.persisted),0));
  setTimeout(()=>{restoreSelections(read(STATE_KEY,{}));const ctx=read(CONTEXT_KEY,null);if(ctx&&ctx.restore)restoreContext(false)},0);
})();
