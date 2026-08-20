(function(){
  if(window.__financeResilienceLoaded)return;window.__financeResilienceLoaded=true;
  if(!document.querySelector('script[data-finance-runtime],script[src="./runtime-lifecycle.js"],script[src$="/runtime-lifecycle.js"]')){const s=document.createElement('script');s.src='./runtime-lifecycle.js';s.defer=true;s.dataset.financeRuntime='1';document.head.appendChild(s)}
  if(!document.querySelector('link[data-finance-reference],link[href="./reference-features.css"],link[href$="/reference-features.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./reference-features.css';l.dataset.financeReference='1';document.head.appendChild(l)}
  if(!document.querySelector('script[data-finance-reference],script[src="./reference-features.js"],script[src$="/reference-features.js"]')){const s=document.createElement('script');s.src='./reference-features.js';s.async=false;s.dataset.financeReference='1';document.head.appendChild(s)}
  const $=(s,r=document)=>r.querySelector(s);const main=$('main');if(!main)return;
  if(!main.id)main.id='financeMain';
  if(!$('.finance-skip-link')){const skip=document.createElement('a');skip.className='finance-skip-link';skip.href='#financeMain';skip.textContent='跳到主要内容';document.body.prepend(skip)}
  main.setAttribute('aria-busy','true');
  const loadingLabel=document.createElement('span');loadingLabel.className='finance-loading-label';loadingLabel.setAttribute('role','status');loadingLabel.setAttribute('aria-live','polite');loadingLabel.textContent='正在加载财经内容';main.prepend(loadingLabel);
  const isDetail=!!$('.stock-app');let ready=false,recovery=null,recoveryTimer=0;const readyObservers=[];
  function coreReady(){if(isDetail)return document.documentElement.classList.contains('detail-ready')||!!$('.not-found');const indices=$('#indices'),status=$('#dataStatus');return !!(indices&&indices.children.length&&status&&!status.textContent.includes('正在'))}
  function stopReadyObservers(){while(readyObservers.length){try{readyObservers.pop().disconnect()}catch(e){}}window.removeEventListener('error',failWhileLoading);window.removeEventListener('unhandledrejection',failWhileLoading)}
  function markReady(){if(ready||!coreReady())return;ready=true;clearTimeout(recoveryTimer);stopReadyObservers();main.setAttribute('aria-busy','false');loadingLabel.textContent='财经内容已加载';document.documentElement.classList.add('finance-app-ready');if(recovery){recovery.remove();recovery=null}setTimeout(()=>{if(loadingLabel.isConnected)loadingLabel.remove()},1200)}
  function recoveryText(){if(navigator.onLine===false)return ['网络连接不可用','当前已加载的内容仍可浏览；恢复网络后可重新载入。'];if(!window.FinanceData)return ['行情模块暂时没有加载完成','没有使用其他资产数据代替。你可以重新载入页面。'];return ['部分财经内容加载较慢','页面没有丢失你的本机自选或偏好，可以重新载入继续。']}
  function showRecovery(){if(ready||recovery)return;const [title,detail]=recoveryText();recovery=document.createElement('div');recovery.className='finance-recovery';recovery.setAttribute('role','alert');recovery.innerHTML=`<div><b>${title}</b><small>${detail}</small></div><button type="button">重新载入</button>`;recovery.querySelector('button').addEventListener('click',()=>location.reload());const anchor=$('.stock-top')||$('.top');if(anchor)anchor.insertAdjacentElement('afterend',recovery);else document.body.prepend(recovery)}
  function syncRecoveryOnline(){if(!recovery)return;if(navigator.onLine){recovery.classList.add('is-online');const b=$('b',recovery),s=$('small',recovery);if(b)b.textContent='网络已恢复';if(s)s.textContent='可以重新载入页面获取完整财经内容。'}else{recovery.classList.remove('is-online');const [t,d]=recoveryText();const b=$('b',recovery),s=$('small',recovery);if(b)b.textContent=t;if(s)s.textContent=d}}
  function focusSearch(){const input=$('#searchInput');if(!input){location.href='./#market';return}window.scrollTo({top:0,behavior:document.documentElement.classList.contains('reduce-motion')?'auto':'smooth'});setTimeout(()=>{input.focus();if(typeof input.select==='function')input.select()},180)}
  function addEmptyAction(container,kind){const empty=$('.empty',container);if(!empty||empty.dataset.resilienceEnhanced)return;empty.dataset.resilienceEnhanced='true';empty.classList.add('enhanced-empty');const actions=document.createElement('div');actions.className='empty-actions';const btn=document.createElement('button');btn.type='button';btn.className='empty-action';if(kind==='watch'){
      const filtered=empty.textContent.includes('这个分类');btn.textContent=filtered?'查看全部自选':'搜索添加自选';btn.addEventListener('click',()=>{if(filtered){$('.watch-filter[data-filter="all"]')?.click()}else focusSearch()});
    }else if(kind==='fund'){
      btn.textContent='查看全部 ETF';btn.addEventListener('click',()=>{$('.fund-cat.on')?.click()});
    }else if(kind==='history'){
      btn.textContent='去搜索股票或 ETF';btn.addEventListener('click',focusSearch);
    }else if(kind==='alerts'){
      btn.textContent='浏览股票并设置提醒';btn.addEventListener('click',focusSearch);
    }else return;
    actions.appendChild(btn);empty.appendChild(actions)
  }
  function watchEmpty(selector,kind){const el=$(selector);if(!el)return;const sync=()=>addEmptyAction(el,kind);sync();if('MutationObserver'in window){const mo=new MutationObserver(sync);mo.observe(el,{childList:true,subtree:false})}}
  watchEmpty('#watchlist','watch');watchEmpty('#fundList','fund');watchEmpty('#historyList','history');watchEmpty('#alertList','alerts');
  const syncReady=()=>requestAnimationFrame(markReady);if('MutationObserver'in window){const rootObserver=new MutationObserver(syncReady);rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});readyObservers.push(rootObserver);const indices=$('#indices'),status=$('#dataStatus');if(indices){const mo=new MutationObserver(syncReady);mo.observe(indices,{childList:true});readyObservers.push(mo)}if(status){const mo=new MutationObserver(syncReady);mo.observe(status,{childList:true,subtree:true,characterData:true});readyObservers.push(mo)}}
  window.addEventListener('online',syncRecoveryOnline);window.addEventListener('offline',()=>{if(!ready)showRecovery();syncRecoveryOnline()});
  function failWhileLoading(){if(!ready)setTimeout(()=>{if(!ready)showRecovery()},300)}window.addEventListener('error',failWhileLoading);window.addEventListener('unhandledrejection',failWhileLoading);
  if(!window.FinanceData)showRecovery();recoveryTimer=setTimeout(()=>{markReady();if(!ready)showRecovery()},4500);markReady();
})();
