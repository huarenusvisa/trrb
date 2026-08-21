(function(){
  if(window.__financeRuntimeLifecycleLoaded)return;window.__financeRuntimeLifecycleLoaded=true;
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const health={bfcacheRestores:0,resumes:0,cleanups:0,coalescedResumes:0,lastResumeAt:0,lastReason:''};
  let lastViewportHeight=0,resumeRaf=0,pendingPersisted=false,pendingReasons=new Set();

  function viewportHeight(){return Math.round((window.visualViewport&&window.visualViewport.height)||window.innerHeight||0)}
  function syncViewport(){
    const h=viewportHeight(),changed=!!h&&Math.abs(h-lastViewportHeight)>1;if(h){lastViewportHeight=h;document.documentElement.style.setProperty('--finance-vvh',`${h}px`)}
    const active=document.activeElement,typing=active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    if(!typing)document.body.classList.remove('finance-keyboard-open');return changed;
  }
  function closeSearch(){
    const input=$('#searchInput'),box=$('#searchResults');if(!input||!box)return;
    box.classList.remove('open');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    $$('.search-hit.active',box).forEach(a=>{a.classList.remove('active');a.setAttribute('aria-selected','false')});
    if(document.activeElement===input)input.blur();
  }
  function dismissToast(){const toast=$('#financeToast');if(toast)toast.classList.remove('show','has-action')}
  function resetChartReading(){
    $$('.chart-scrub-tip,.kline-tip').forEach(t=>{t.style.opacity='0';t.style.transform='translateY(3px)'});
    $$('[data-scrub-overlay],[data-kline-cross]').forEach(x=>x.setAttribute('visibility','hidden'));
    $$('.stock-ticker.chart-reading').forEach(x=>x.classList.remove('chart-reading'));
  }
  function cleanupTransient(){closeSearch();dismissToast();resetChartReading();document.body.classList.remove('finance-keyboard-open');health.cleanups++}
  function resyncVisualState(reasons){
    const viewportChanged=syncViewport();
    const top=$('.top');if(top)top.classList.toggle('is-compact',window.scrollY>72);
    const stockTop=$('.stock-top'),hero=$('.stock-hero');if(stockTop&&hero)stockTop.classList.toggle('detail-scrolled',window.scrollY>Math.max(110,hero.offsetTop+90));
    if(viewportChanged)window.dispatchEvent(new CustomEvent('finance:viewportchange',{detail:{height:lastViewportHeight}}));
    window.dispatchEvent(new CustomEvent('finance:resume',{detail:{reasons}}));
  }
  function flushResume(){
    resumeRaf=0;const persisted=pendingPersisted,reasons=Array.from(pendingReasons);pendingPersisted=false;pendingReasons.clear();
    health.resumes++;health.lastResumeAt=Date.now();health.lastReason=reasons.join(',');if(persisted)health.bfcacheRestores++;
    cleanupTransient();requestAnimationFrame(()=>resyncVisualState(reasons))
  }
  function scheduleResume(reason,{persisted=false}={}){
    pendingReasons.add(reason);if(persisted)pendingPersisted=true;
    if(resumeRaf){health.coalescedResumes++;return}resumeRaf=requestAnimationFrame(flushResume)
  }

  window.addEventListener('pagehide',cleanupTransient);
  window.addEventListener('pageshow',e=>scheduleResume('pageshow',{persisted:!!e.persisted}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleResume('visible');else dismissToast()});
  window.addEventListener('orientationchange',()=>setTimeout(()=>scheduleResume('orientation'),220),{passive:true});
  window.addEventListener('focus',()=>requestAnimationFrame(syncViewport),{passive:true});

  window.FinanceRuntimeHealth={snapshot:()=>({...health,visibility:document.visibilityState,online:navigator.onLine,viewportHeight:viewportHeight()})};
  syncViewport();
})();
