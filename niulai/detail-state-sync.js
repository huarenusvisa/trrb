(function(){
  if(window.__financeDetailStateSyncLoaded)return;window.__financeDetailStateSyncLoaded=true;
  const D=window.FinanceData;if(!D)return;
  const $=(s,r=document)=>r.querySelector(s);
  const symbol=(new URLSearchParams(location.search).get('symbol')||'').toUpperCase();
  const stockWatch=$('#watchBtn'),stockAlert=$('#alertBtn'),fundWatch=$('#fundWatchBtn');
  const type=stockWatch?'stock':fundWatch?'fund':'none';
  const health={runs:0,lastReason:'',lastAt:0};
  function validAsset(){if(type==='stock')return !!D.getQuote(symbol);if(type==='fund')return !!D.getFund(symbol);return false}
  function syncStock(){
    if(!stockWatch||!stockAlert||!D.getQuote(symbol))return false;
    const watched=D.getWatchlist().includes(symbol),alerted=D.isAlertOn?D.isAlertOn(symbol):false;
    stockWatch.textContent=watched?'✓ 已自选':'+ 加入自选';stockWatch.setAttribute('aria-pressed',String(watched));
    stockAlert.textContent=alerted?'✓ 已设置提醒':'设置提醒';stockAlert.setAttribute('aria-pressed',String(alerted));
    return true
  }
  function syncFund(){
    if(!fundWatch||!D.getFund(symbol))return false;
    const watched=D.getFundWatchlist().includes(symbol);
    fundWatch.textContent=watched?'✓ 已关注':'+ 加入基金自选';fundWatch.setAttribute('aria-pressed',String(watched));
    return true
  }
  function sync(reason='manual'){
    const ok=type==='stock'?syncStock():type==='fund'?syncFund():false;
    health.runs++;health.lastReason=reason;health.lastAt=Date.now();return ok
  }
  function relevantStorage(e){
    if(!e||e.key===null)return true;
    if(type==='stock')return e.key==='trfinance.watchlist'||e.key===`trfinance.alert.${symbol}`;
    if(type==='fund')return e.key==='trfinance.fundWatchlist';
    return false
  }
  window.addEventListener('finance:resume',()=>requestAnimationFrame(()=>sync('finance:resume')));
  window.addEventListener('storage',e=>{if(relevantStorage(e))requestAnimationFrame(()=>sync('storage'))});
  window.addEventListener('pageshow',e=>{if(e.persisted)requestAnimationFrame(()=>sync('pageshow'))});
  window.FinanceDetailStateSync={
    sync,
    snapshot:()=>({type,symbol,valid:validAsset(),runs:health.runs,lastReason:health.lastReason,lastAt:health.lastAt,watchPressed:(stockWatch||fundWatch)?.getAttribute('aria-pressed')||null,alertPressed:stockAlert?.getAttribute('aria-pressed')||null})
  };
  sync('init');
})();
