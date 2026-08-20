(function(){
  const base=window.FinanceQaInteractions;if(!base||base.__detailStateWrapped)return;
  const original=base.run.bind(base),delay=ms=>new Promise(r=>setTimeout(r,ms));
  const result=(name,ok,detail='')=>({name,status:ok?'pass':'fail',detail:detail||(ok?'通过':'未通过')});
  function aborted(signal){if(signal?.aborted){const e=new Error('QA detail state aborted');e.name='AbortError';throw e}}
  async function waitFor(fn,{signal=null,timeout=1000,interval=28}={}){const start=Date.now();while(Date.now()-start<timeout){aborted(signal);try{const v=fn();if(v)return v}catch(e){}await delay(interval)}aborted(signal);try{return fn()||null}catch(e){return null}}
  function storageEvent(win,key){try{win.dispatchEvent(new win.StorageEvent('storage',{key}))}catch(e){const ev=new win.Event('storage');try{Object.defineProperty(ev,'key',{value:key})}catch(err){}win.dispatchEvent(ev)}}
  function sameList(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i])}
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
    try{if(type==='stock')items.push(...await stockChecks(win,opts.signal));else if(type==='fund')items.push(...await fundChecks(win,opts.signal))}catch(e){if(e?.name!=='AbortError')items.push(result('详情状态同步附加验收',false,e?.message||String(e)))}
    return items
  };
  base.__detailStateWrapped=true;
})();
