(function(){
  const base=window.FinanceQaInteractions;if(!base||base.__detailStateWrapped)return;
  const original=base.run.bind(base),delay=ms=>new Promise(r=>setTimeout(r,ms));
  const result=(name,ok,detail='')=>({name,status:ok?'pass':'fail',detail:detail||(ok?'通过':'未通过')});
  function aborted(signal){if(signal?.aborted){const e=new Error('QA detail state aborted');e.name='AbortError';throw e}}
  async function waitFor(fn,{signal=null,timeout=1000,interval=28}={}){const start=Date.now();while(Date.now()-start<timeout){aborted(signal);try{const v=fn();if(v)return v}catch(e){}await delay(interval)}aborted(signal);try{return fn()||null}catch(e){return null}}
  function storageEvent(win,key){try{win.dispatchEvent(new win.StorageEvent('storage',{key}))}catch(e){const ev=new win.Event('storage');try{Object.defineProperty(ev,'key',{value:key})}catch(err){}win.dispatchEvent(ev)}}
  function pageShow(win,persisted=true){try{win.dispatchEvent(new win.PageTransitionEvent('pageshow',{persisted}))}catch(e){const ev=new win.Event('pageshow');try{Object.defineProperty(ev,'persisted',{value:persisted})}catch(err){}win.dispatchEvent(ev)}}
  async function navigationRestoreChecks(win,signal){
    const app=win.FinanceAppState,doc=win.document;if(!app)return [result('首页恢复 setter 已加载',false,'缺少 FinanceAppState')];
    const stateKey='trfinance.navState',contextKey='trfinance.navContext',beforeState=win.sessionStorage.getItem(stateKey),beforeContext=win.sessionStorage.getItem(contextKey),before=app.snapshot(),items=[];let clicks=0;
    const onClick=e=>{if(e.target?.closest?.('.market-tab,.watch-filter,.fund-cat,.bottom button'))clicks++};doc.addEventListener('click',onClick,true);
    try{
      app.setPage('market',{updateHash:false,scroll:false});app.setMarketPanel('now');app.setWatchFilter('all');app.setFundFilter('all');
      const desired={marketPanel:'macro',watchFilter:'etf',fundFilter:'gold',page:'watch',ts:Date.now()};
      win.sessionStorage.setItem(stateKey,JSON.stringify(desired));win.sessionStorage.setItem(contextKey,JSON.stringify({...desired,scrollY:0,href:'stock.html?symbol=AAPL',restore:true}));
      pageShow(win,true);
      const restored=await waitFor(()=>{const s=app.snapshot();return s.page==='watch'&&s.marketPanel==='macro'&&s.watchFilter==='etf'&&s.fundFilter==='gold'?s:null},{signal,timeout:1600});
      items.push(result('首页：BFCache 恢复通过内部 setter 还原四类状态',!!restored,restored?`page=${restored.page} · market=${restored.marketPanel} · watch=${restored.watchFilter} · fund=${restored.fundFilter}`:'未完整恢复 page / market / watch / fund 状态'));
      items.push(result('首页：BFCache 四类状态恢复不产生 synthetic click',clicks===0,`navigation control click=${clicks}`));
    }finally{
      if(beforeState===null)win.sessionStorage.removeItem(stateKey);else win.sessionStorage.setItem(stateKey,beforeState);
      if(beforeContext===null)win.sessionStorage.removeItem(contextKey);else win.sessionStorage.setItem(contextKey,beforeContext);
      app.setMarketPanel(before.marketPanel||'now');app.setWatchFilter(before.watchFilter||'all');app.setFundFilter(before.fundFilter||'all');app.setPage(before.page||'market',{updateHash:false,scroll:false});doc.removeEventListener('click',onClick,true)
    }
    return items
  }
  async function homeChecks(win,signal){
    const D=win.FinanceData,app=win.FinanceAppState,list=win.document.querySelector('#watchlist');if(!D||!app||!list)return [result('首页内部刷新接口已加载',false,'缺少 FinanceAppState / FinanceData / watchlist')];
    const before=D.getWatchlist(),hadAapl=before.includes('AAPL'),mutated=hadAapl?before.filter(s=>s!=='AAPL'):['AAPL',...before],items=[];let filterClicks=0;
    const onClick=e=>{if(e.target?.closest?.('.watch-filter'))filterClicks++};win.document.addEventListener('click',onClick,true);
    try{
      app.refreshWatch('qa-baseline');const start=app.snapshot().refreshes.watch;D.setWatchlist(mutated);storageEvent(win,'trfinance.watchlist');
      const storageSynced=await waitFor(()=>{const snap=app.snapshot(),has=!!list.querySelector('a[href*="symbol=AAPL"]');return snap.lastRefreshReason==='storage'&&snap.refreshes.watch>start&&has===!hadAapl?snap:null},{signal,timeout:1400});
      items.push(result('首页：storage 直接刷新自选 DOM',!!storageSynced,storageSynced?`refreshes=${storageSynced.refreshes.watch}`:'storage 后未通过 FinanceAppState 刷新'));
      items.push(result('首页：storage 刷新不模拟筛选点击',filterClicks===0,`watch-filter click=${filterClicks}`));
      D.setWatchlist(before);const beforeResume=app.snapshot().refreshes.watch;win.dispatchEvent(new win.CustomEvent('finance:resume',{detail:{reasons:['qa-watch-refresh']}}));
      const resumed=await waitFor(()=>{const snap=app.snapshot(),has=!!list.querySelector('a[href*="symbol=AAPL"]');return snap.lastRefreshReason==='finance:resume'&&snap.refreshes.watch>beforeResume&&has===hadAapl?snap:null},{signal,timeout:1400});
      items.push(result('首页：finance:resume 直接刷新自选 DOM',!!resumed,resumed?`refreshes=${resumed.refreshes.watch}`:'resume 后未通过 FinanceAppState 刷新'));
      items.push(result('首页：resume 刷新不模拟筛选点击',filterClicks===0,`watch-filter click=${filterClicks}`));
    }finally{D.setWatchlist(before);app.refreshWatch('qa-cleanup');win.document.removeEventListener('click',onClick,true)}
    items.push(...await navigationRestoreChecks(win,signal));
    return items
  }
  async function stockChecks(win,signal){
    const D=win.FinanceData,sync=win.FinanceDetailStateSync,watch=win.document.querySelector('#watchBtn'),alert=win.document.querySelector('#alertBtn');if(!D||!sync||!watch||!alert)return [result('详情状态同步层已加载',false,'股票详情缺少 FinanceDetailStateSync 或按钮')];
    const symbol=(new URLSearchParams(win.location.search).get('symbol')||'AAPL').toUpperCase(),beforeWatch=D.getWatchlist(),beforeAlert=D.isAlertOn?D.isAlertOn(symbol):false,items=[];
    try{
      D.setWatchlist(beforeWatch.filter(s=>s!==symbol));if(D.setAlert)D.setAlert(symbol,false);storageEvent(win,'trfinance.watchlist');storageEvent(win,`trfinance.alert.${symbol}`);
      const storageSynced=await waitFor(()=>watch.getAttribute('aria-pressed')==='false'&&alert.getAttribute('aria-pressed')==='false'&&sync.snapshot().lastReason==='storage',{signal,timeout:1200});
      items.push(result('详情：跨标签 storage 同步股票自选与提醒',!!storageSynced,storageSynced?'按钮已读取外部状态':'storage 后按钮仍是旧状态'));
      D.setWatchlist(beforeWatch);if(D.setAlert)D.setAlert(symbol,beforeAlert);win.dispatchEvent(new win.CustomEvent('finance:resume',{detail:{reasons:['qa-detail-state']}}));
      const expectedWatch=beforeWatch.includes(symbol)?'true':'false',expectedAlert=beforeAlert?'true':'false';
      const resumed=await waitFor(()=>watch.getAttribute('aria-pressed')===expectedWatch&&alert.getAttribute('aria-pressed')===expectedAlert&&sync.snapshot().lastReason==='finance:resume',{signal,timeout:1200});
      items.push(result('详情：finance:resume 恢复股票按钮真实状态',!!resumed,resumed?`watch=${expectedWatch} · alert=${expectedAlert}`:`watch=${watch.getAttribute('aria-pressed')} · alert=${alert.getAttribute('aria-pressed')}`));
    }finally{D.setWatchlist(beforeWatch);if(D.setAlert)D.setAlert(symbol,beforeAlert);sync.sync('qa-cleanup')}
    return items
  }
  async function fundChecks(win,signal){
    const D=win.FinanceData,sync=win.FinanceDetailStateSync,button=win.document.querySelector('#fundWatchBtn');if(!D||!sync||!button)return [result('详情状态同步层已加载',false,'ETF详情缺少 FinanceDetailStateSync 或关注按钮')];
    const symbol=(new URLSearchParams(win.location.search).get('symbol')||'QQQ').toUpperCase(),before=D.getFundWatchlist(),items=[];
    try{
      D.setFundWatchlist(before.filter(s=>s!==symbol));storageEvent(win,'trfinance.fundWatchlist');
      const storageSynced=await waitFor(()=>button.getAttribute('aria-pressed')==='false'&&sync.snapshot().lastReason==='storage',{signal,timeout:1200});
      items.push(result('详情：跨标签 storage 同步 ETF 关注状态',!!storageSynced,storageSynced?'ETF按钮已读取外部状态':'storage 后 ETF 按钮仍是旧状态'));
      D.setFundWatchlist(before);win.dispatchEvent(new win.CustomEvent('finance:resume',{detail:{reasons:['qa-detail-state']}}));const expected=before.includes(symbol)?'true':'false';
      const resumed=await waitFor(()=>button.getAttribute('aria-pressed')===expected&&sync.snapshot().lastReason==='finance:resume',{signal,timeout:1200});
      items.push(result('详情：finance:resume 恢复 ETF 按钮真实状态',!!resumed,resumed?`watch=${expected}`:`watch=${button.getAttribute('aria-pressed')}`));
    }finally{D.setFundWatchlist(before);sync.sync('qa-cleanup')}
    return items
  }
  base.run=async function(win,type,opts={}){
    const items=await original(win,type,opts);if(opts.signal?.aborted)return items;
    try{if(type==='home')items.push(...await homeChecks(win,opts.signal));else if(type==='stock')items.push(...await stockChecks(win,opts.signal));else if(type==='fund')items.push(...await fundChecks(win,opts.signal))}catch(e){if(e?.name!=='AbortError')items.push(result('状态同步附加验收',false,e?.message||String(e)))}
    return items
  };
  base.__detailStateWrapped=true;
})();