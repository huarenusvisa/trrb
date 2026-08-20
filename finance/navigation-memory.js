(function(){
  if(window.__financeNavigationMemoryLoaded)return;window.__financeNavigationMemoryLoaded=true;
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const STATE_KEY='trfinance.navState';const CONTEXT_KEY='trfinance.navContext';
  const validPages=['market','watch','funds','profile'];
  const read=(key,fallback={})=>{try{return JSON.parse(sessionStorage.getItem(key)||JSON.stringify(fallback))}catch(e){return fallback}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value))}catch(e){}};
  const currentPage=()=>{const p=$('.page.active')?.dataset.page||location.hash.slice(1)||'market';return validPages.includes(p)?p:'market'};
  function selectionState(){
    return {
      marketPanel:$('.market-tab.on')?.dataset.panel||'now',
      watchFilter:$('.watch-filter.on')?.dataset.filter||'all',
      fundFilter:$('.fund-cat.on')?.dataset.fundFilter||'all'
    };
  }
  function saveSelections(){write(STATE_KEY,{...read(STATE_KEY,{}),...selectionState(),page:currentPage(),ts:Date.now()})}
  function clickIfNeeded(selector,desired,attr){
    if(!desired||desired==='all'&&attr==='data-fund-filter')return;
    const target=$(`${selector}[${attr}="${desired}"]`);if(!target)return;
    const active=target.classList.contains('on')||target.getAttribute('aria-pressed')==='true'||target.getAttribute('aria-selected')==='true';if(!active)target.click();
  }
  function restoreSelections(state){
    if(!state)return;
    clickIfNeeded('.market-tab',state.marketPanel,'data-panel');
    clickIfNeeded('.watch-filter',state.watchFilter,'data-filter');
    if(state.fundFilter&&state.fundFilter!=='all')clickIfNeeded('.fund-cat',state.fundFilter,'data-fund-filter');
  }
  function captureContext(link){
    if(!link)return;const href=link.getAttribute('href')||'';if(!/(?:stock|fund)\.html\?/i.test(href))return;
    const ctx={page:currentPage(),scrollY:Math.max(0,Math.round(window.scrollY||0)),...selectionState(),href,ts:Date.now(),restore:false};write(CONTEXT_KEY,ctx);saveSelections();
  }
  document.addEventListener('click',e=>{
    const detailLink=e.target.closest('a[href*="stock.html?"],a[href*="fund.html?"]');if(detailLink)captureContext(detailLink);
    if(e.target.closest('.market-tab,.watch-filter,.fund-cat,.bottom button'))requestAnimationFrame(saveSelections);
  },true);
  let scrollTick=false;window.addEventListener('scroll',()=>{if(scrollTick)return;scrollTick=true;requestAnimationFrame(()=>{const ctx=read(CONTEXT_KEY,null);if(ctx&&ctx.page===currentPage()&&!ctx.restore){ctx.scrollY=Math.max(0,Math.round(window.scrollY||0));ctx.ts=Date.now();write(CONTEXT_KEY,ctx)}scrollTick=false})},{passive:true});
  window.addEventListener('pagehide',saveSelections);
  function restoreContext(){
    const state=read(STATE_KEY,{});restoreSelections(state);
    const ctx=read(CONTEXT_KEY,null);if(!ctx)return;
    const nav=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];const backForward=nav&&nav.type==='back_forward';
    if(!(ctx.restore||backForward)||Date.now()-ctx.ts>30*60*1000)return;
    if(validPages.includes(ctx.page)&&currentPage()!==ctx.page){const btn=$(`.bottom button[data-target="${ctx.page}"]`);if(btn)btn.click()}
    requestAnimationFrame(()=>{restoreSelections(ctx);requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,ctx.scrollY||0),behavior:'auto'}))});
    ctx.restore=false;ctx.ts=Date.now();write(CONTEXT_KEY,ctx);
  }
  window.addEventListener('pageshow',()=>setTimeout(restoreContext,0));
  setTimeout(()=>{restoreSelections(read(STATE_KEY,{}));const ctx=read(CONTEXT_KEY,null);if(ctx&&ctx.restore)restoreContext()},0);
  window.FinanceNavigationMemory={
    getContext:()=>read(CONTEXT_KEY,null),
    markReturn:()=>{const ctx=read(CONTEXT_KEY,null);if(ctx){ctx.restore=true;ctx.ts=Date.now();write(CONTEXT_KEY,ctx)}return ctx},
    clearContext:()=>{try{sessionStorage.removeItem(CONTEXT_KEY)}catch(e){}}
  };
})();
