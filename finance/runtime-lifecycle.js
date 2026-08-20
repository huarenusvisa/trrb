(function(){
  if(window.__financeRuntimeLifecycleLoaded)return;window.__financeRuntimeLifecycleLoaded=true;
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const health={bfcacheRestores:0,resumes:0,cleanups:0,lastResumeAt:0};

  function syncViewport(){
    const vv=window.visualViewport;const h=vv?vv.height:window.innerHeight;
    if(h)document.documentElement.style.setProperty('--finance-vvh',`${Math.round(h)}px`);
    const active=document.activeElement,typing=active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    if(!typing)document.body.classList.remove('finance-keyboard-open');
  }
  function closeSearch(){
    const input=$('#searchInput'),box=$('#searchResults');if(!input||!box)return;
    box.classList.remove('open');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    $$('.search-hit.active',box).forEach(a=>{a.classList.remove('active');a.setAttribute('aria-selected','false')});
    if(document.activeElement===input)input.blur();
  }
  function dismissToast(){
    const toast=$('#financeToast');if(!toast)return;toast.classList.remove('show','has-action');
  }
  function resetChartReading(){
    $$('.chart-scrub-tip').forEach(t=>{t.style.opacity='0';t.style.transform='translateY(3px)'});
    $$('[data-scrub-overlay]').forEach(x=>x.setAttribute('visibility','hidden'));
    $$('.stock-ticker.chart-reading').forEach(x=>x.classList.remove('chart-reading'));
  }
  function cleanupTransient(){
    closeSearch();dismissToast();resetChartReading();document.body.classList.remove('finance-keyboard-open');health.cleanups++;
  }
  function resyncVisualState(){
    syncViewport();
    const top=$('.top');if(top)top.classList.toggle('is-compact',window.scrollY>72);
    const stockTop=$('.stock-top'),hero=$('.stock-hero');if(stockTop&&hero)stockTop.classList.toggle('detail-scrolled',window.scrollY>Math.max(110,hero.offsetTop+90));
    window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('scroll'));
  }
  function resume({persisted=false}={}){
    health.resumes++;health.lastResumeAt=Date.now();if(persisted)health.bfcacheRestores++;
    cleanupTransient();requestAnimationFrame(()=>requestAnimationFrame(resyncVisualState));
  }

  window.addEventListener('pagehide',()=>cleanupTransient());
  window.addEventListener('pageshow',e=>resume({persisted:!!e.persisted}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume({persisted:false});else dismissToast()});
  window.addEventListener('orientationchange',()=>setTimeout(resyncVisualState,220),{passive:true});
  window.addEventListener('focus',()=>requestAnimationFrame(syncViewport),{passive:true});

  window.FinanceRuntimeHealth={snapshot:()=>({...health,visibility:document.visibilityState,online:navigator.onLine,viewportHeight:Math.round((window.visualViewport&&window.visualViewport.height)||window.innerHeight||0)})};
  syncViewport();
})();
