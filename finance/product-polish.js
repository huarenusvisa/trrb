(function(){
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
  function renderQuickSearch(){
    if(!input||!box||input.value.trim())return;
    const data=quickAssets();if(!data.items.length)return;
    box.innerHTML=`<div class="search-quick-head"><span>${data.label}</span><kbd>/</kbd></div>${data.items.map((x,i)=>`<a id="quick-search-${i}" role="option" class="search-hit quick-search-hit" href="${quickHref(x)}"><div><b>${x.name}</b><small>${x.symbol} · ${quickMeta(x)}</small></div><span class="quick-symbol">${x.symbol}</span></a>`).join('')}`;
    box.classList.add('open');input.setAttribute('aria-expanded','true');
  }

  if(input&&box){
    input.addEventListener('focus',renderQuickSearch);
    input.addEventListener('input',()=>{if(!input.value.trim())requestAnimationFrame(renderQuickSearch)});
    document.addEventListener('keydown',e=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      const typing=tag==='input'||tag==='textarea'||tag==='select'||(e.target&&e.target.isContentEditable);
      if(e.key==='/'&&!typing&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();input.focus();input.select();renderQuickSearch()}
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
