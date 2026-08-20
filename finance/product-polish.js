(function(){
  function loadResilience(){
    if(!document.querySelector('link[data-finance-resilience],link[href="./resilience.css"],link[href$="/resilience.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./resilience.css';l.dataset.financeResilience='1';document.head.appendChild(l)}
    if(!document.querySelector('script[data-finance-resilience],script[src="./resilience.js"],script[src$="/resilience.js"]')){const s=document.createElement('script');s.src='./resilience.js';s.async=false;s.dataset.financeResilience='1';document.head.appendChild(s)}
  }
  function loadNavigationMemory(){
    if(document.querySelector('script[data-finance-nav-memory],script[src="./navigation-memory.js"],script[src$="/navigation-memory.js"]'))return;const s=document.createElement('script');s.src='./navigation-memory.js';s.async=false;s.dataset.financeNavMemory='1';document.head.appendChild(s)
  }
  loadResilience();loadNavigationMemory();
  const D=window.FinanceData;if(!D)return;
  const $=(s,r=document)=>r.querySelector(s);
  const input=$('#searchInput'),box=$('#searchResults'),top=$('.top');

  function readHistory(){
    try{return JSON.parse(localStorage.getItem('trfinance.history')||'[]')}catch(e){return []}
  }
  function assetFromHistory(item){
    if(!item||!item.symbol)return null;
    if(item.type==='fund'){
      const f=D.getFund(item.symbol);return f?{...f,type:'fund'}:null;
    }
    const q=D.getQuote(item.symbol);return q?{...q,type:'stock'}:null;
  }
  function fallbackAssets(){
    return [
      D.getQuote('AAPL')&&{...D.getQuote('AAPL'),type:'stock'},
      D.getQuote('NVDA')&&{...D.getQuote('NVDA'),type:'stock'},
      D.getFund('SPY')&&{...D.getFund('SPY'),type:'fund'},
      D.getFund('QQQ')&&{...D.getFund('QQQ'),type:'fund'}
    ].filter(Boolean);
  }
  function quickAssets(){
    const seen=new Set(),items=[];
    for(const h of readHistory()){
      const asset=assetFromHistory(h);if(!asset||seen.has(asset.symbol))continue;
      seen.add(asset.symbol);items.push(asset);if(items.length===4)break;
    }
    return items.length?{label:'最近浏览',items}:{label:'热门搜索',items:fallbackAssets()};
  }
  function quickHref(x){return `${x.type==='fund'?'fund.html':'stock.html'}?symbol=${encodeURIComponent(x.symbol)}`}
  function quickMeta(x){return x.type==='fund'?`${x.category||'ETF'} · ETF`:`${x.market||'美股'} · 股票`}
  function clearSearchSelection(){
    if(!input||!box)return;box.querySelectorAll('.search-hit.active').forEach(a=>{a.classList.remove('active');a.setAttribute('aria-selected','false')});input.removeAttribute('aria-activedescendant')
  }
  function renderQuickSearch(){
    if(!input||!box||input.value.trim())return;
    const data=quickAssets();if(!data.items.length)return;
    clearSearchSelection();
    box.innerHTML=`<div class="search-quick-head"><span>${data.label}</span><kbd>/</kbd></div>${data.items.map((x,i)=>`<a id="quick-search-${i}" role="option" class="search-hit quick-search-hit" href="${quickHref(x)}"><div><b>${x.name}</b><small>${x.symbol} · ${quickMeta(x)}</small></div><span class="quick-symbol">${x.symbol}</span></a>`).join('')}`;
    box.classList.add('open');input.setAttribute('aria-expanded','true');
  }
  function syncSearchA11y(){
    if(!input||!box)return;const hits=Array.from(box.querySelectorAll('.search-hit'));let active=null;
    hits.forEach((a,i)=>{if(!a.id)a.id=`finance-search-option-${i}`;const on=a.classList.contains('active');a.setAttribute('aria-selected',String(on));if(on)active=a});
    if(active&&box.classList.contains('open'))input.setAttribute('aria-activedescendant',active.id);else input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded',String(box.classList.contains('open')));
  }

  if(input&&box){
    input.addEventListener('focus',()=>{renderQuickSearch();requestAnimationFrame(syncSearchA11y)});
    input.addEventListener('input',()=>{if(!input.value.trim())requestAnimationFrame(renderQuickSearch);requestAnimationFrame(syncSearchA11y)});
    input.addEventListener('search',()=>requestAnimationFrame(()=>{if(!input.value.trim())renderQuickSearch();syncSearchA11y()}));
    input.addEventListener('keydown',e=>{if(e.key==='Escape')clearSearchSelection();if(['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key))requestAnimationFrame(syncSearchA11y)});
    if('MutationObserver'in window)new MutationObserver(()=>requestAnimationFrame(syncSearchA11y)).observe(box,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    const wrap=input.closest('.search-wrap');if(wrap)wrap.addEventListener('focusout',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement)){box.classList.remove('open');input.setAttribute('aria-expanded','false');clearSearchSelection()}},0));
    document.addEventListener('keydown',e=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      const typing=tag==='input'||tag==='textarea'||tag==='select'||(e.target&&e.target.isContentEditable);
      if(e.key==='/'&&!typing&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();input.focus();input.select();renderQuickSearch();requestAnimationFrame(syncSearchA11y)}
    });
  }

  if(top){
    let ticking=false;
    const syncHeader=()=>{top.classList.toggle('is-compact',window.scrollY>72);ticking=false};
    window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(syncHeader)}},{passive:true});
    syncHeader();
  }

  if(window.visualViewport){
    const vv=window.visualViewport;
    let viewportBaseline=Math.max(vv.height,document.documentElement.clientHeight,window.innerHeight||0);
    const syncKeyboard=()=>{
      const current=Math.max(vv.height,document.documentElement.clientHeight,window.innerHeight||0);
      if(current>viewportBaseline)viewportBaseline=current;
      document.body.classList.toggle('finance-keyboard-open',vv.height<viewportBaseline*.74);
      document.documentElement.style.setProperty('--finance-vvh',`${Math.round(vv.height)}px`);
    };
    vv.addEventListener('resize',syncKeyboard,{passive:true});
    vv.addEventListener('scroll',syncKeyboard,{passive:true});
    window.addEventListener('orientationchange',()=>{setTimeout(()=>{viewportBaseline=Math.max(vv.height,document.documentElement.clientHeight,window.innerHeight||0);syncKeyboard()},220)},{passive:true});
    syncKeyboard();
  }
})();