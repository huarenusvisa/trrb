(function(){
  function loadResilience(){
    if(!document.querySelector('link[data-finance-resilience],link[href="./resilience.css"],link[href$="/resilience.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./resilience.css';l.dataset.financeResilience='1';document.head.appendChild(l)}
    if(!document.querySelector('script[data-finance-resilience],script[src="./resilience.js"],script[src$="/resilience.js"]')){const s=document.createElement('script');s.src='./resilience.js';s.async=false;s.dataset.financeResilience='1';document.head.appendChild(s)}
  }
  function loadNavigationMemory(){
    if(document.querySelector('script[data-finance-nav-memory],script[src="./navigation-memory.js"],script[src$="/navigation-memory.js"]'))return;const s=document.createElement('script');s.src='./navigation-memory.js';s.async=false;s.dataset.financeNavMemory='1';document.head.appendChild(s)
  }
  loadResilience();loadNavigationMemory();
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const isFund=/\/fund\.html$/i.test(location.pathname)||!!$('#fundName');
  function readContext(){
    if(window.FinanceNavigationMemory?.getContext)return window.FinanceNavigationMemory.getContext();
    try{return JSON.parse(sessionStorage.getItem('trfinance.navContext')||'null')}catch(e){return null}
  }
  function markReturn(){
    if(window.FinanceNavigationMemory?.markReturn)return window.FinanceNavigationMemory.markReturn();
    const ctx=readContext();if(!ctx||Date.now()-(ctx.ts||0)>30*60*1000)return null;ctx.restore=true;ctx.ts=Date.now();try{sessionStorage.setItem('trfinance.navContext',JSON.stringify(ctx))}catch(e){}return ctx
  }
  function setupContextBack(){
    const ctx=readContext(),fallbackPage=isFund?'funds':'watch',page=['market','watch','funds','profile'].includes(ctx?.page)?ctx.page:fallbackPage;
    const pageLabels={market:'行情',watch:'自选',funds:'基金',profile:'我的'},label=pageLabels[page]||'财经';const target=`./#${page}`;
    const controls=[$('.back'),$('#fundBackBtn')].filter(Boolean);
    controls.forEach(el=>{if(el.tagName==='A')el.href=target;el.setAttribute('aria-label',`返回${label}`);if(el.id==='fundBackBtn')el.textContent=`返回${label}`;el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const saved=markReturn();if(saved&&history.length>1)history.back();else location.href=target},true)});
  }
  setupContextBack();

  const top=$('.stock-top'),content=$('.stock-content'),hero=$('.stock-hero'),ticker=$('.stock-ticker');if(!top||!content||!hero||!ticker)return;
  const labels=isFund?['概览','基金概览','核心持仓','相关资讯','风险说明']:['概览','关键数据','新闻','分析师评级','营收与利润','财报','公告','热度','公司概览'];
  const sections=[hero,...$$('.stock-section',content)];
  sections.forEach((s,i)=>{if(!s.id)s.id=`detail-section-${i}`});
  const nav=document.createElement('nav');nav.className='detail-nav';nav.setAttribute('aria-label',isFund?'基金详情分区':'个股详情分区');
  nav.innerHTML=sections.map((s,i)=>`<a href="#${s.id}" class="${i===0?'on':''}" data-index="${i}">${labels[i]||$('h2',s)?.textContent||`分区${i+1}`}</a>`).join('');
  hero.insertAdjacentElement('afterend',nav);
  const links=$$('a',nav);
  links.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.getAttribute('href').slice(1),target=document.getElementById(id);if(!target)return;target.scrollIntoView({behavior:document.documentElement.classList.contains('reduce-motion')?'auto':'smooth',block:'start'});history.replaceState(null,'',`${location.pathname}${location.search}#${id}`)}));
  const setActive=i=>{links.forEach((a,n)=>{const on=n===i;a.classList.toggle('on',on);a.setAttribute('aria-current',on?'location':'false')});const a=links[i];if(a)a.scrollIntoView({block:'nearest',inline:'center'})};
  let sectionObserver=null,lastObserverOffset=0;
  const observerTopOffset=()=>Math.max(96,Math.round((top.getBoundingClientRect().height||64)+(nav.getBoundingClientRect().height||54)));
  function setupSectionObserver(force=false){
    if(!('IntersectionObserver'in window))return;const offset=observerTopOffset();if(!force&&sectionObserver&&Math.abs(offset-lastObserverOffset)<2)return;lastObserverOffset=offset;if(sectionObserver)sectionObserver.disconnect();
    sectionObserver=new IntersectionObserver(entries=>{const visible=entries.filter(x=>x.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(!visible.length)return;const i=sections.indexOf(visible[0].target);if(i>=0)setActive(i)},{rootMargin:`-${offset}px 0px -68% 0px`,threshold:[0,.01,.15]});sections.forEach(s=>sectionObserver.observe(s));
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>setupSectionObserver(true)));
  window.addEventListener('finance:viewportchange',()=>requestAnimationFrame(()=>setupSectionObserver()),{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(()=>setupSectionObserver(true),260),{passive:true});

  let ticking=false;const syncScroll=()=>{top.classList.toggle('detail-scrolled',window.scrollY>Math.max(110,hero.offsetTop+90));ticking=false};
  window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(syncScroll)}},{passive:true});syncScroll();

  const stockPrice=$('#topPrice'),stockSymbol=$('#topSymbol'),fundSymbol=$('#fundSymbol'),moveEl=$('#move');let basePrimary='',baseSecondary='';
  const ensureFundHeader=()=>{if(!isFund)return;const price=$('#fundPrice')?.textContent||'—',change=$('#fundChange')?.textContent||'';if(fundSymbol)fundSymbol.textContent=price;const span=$('span',ticker);if(span)span.innerHTML=`${$('#fundName')?.textContent||''} <em class="mini-change ${($('#fundChange')?.classList.contains('down'))?'down':'up'}">${change}</em>`};
  const stockSecondaryHtml=()=>{const change=moveEl?.textContent||'',sign=moveEl?.classList.contains('down')?'down':'up',sym=$('#symbol')?.textContent||stockSymbol?.textContent?.split(/\s+/)[0]||'';return `${sym} <em class="mini-change ${sign}">${change.match(/\([^)]*\)/)?.[0]||''}</em>`};
  const syncStockSecondary=()=>{if(isFund||!stockSymbol)return;baseSecondary=stockSecondaryHtml();if(!ticker.classList.contains('chart-reading'))stockSymbol.innerHTML=baseSecondary};
  const captureBase=()=>{if(isFund){ensureFundHeader();basePrimary=fundSymbol?.textContent||'';baseSecondary=$('span',ticker)?.innerHTML||''}else{basePrimary=stockPrice?.textContent||'';syncStockSecondary()}};
  const restoreHeader=()=>{ticker.classList.remove('chart-reading');if(isFund){if(fundSymbol)fundSymbol.textContent=basePrimary;const span=$('span',ticker);if(span)span.innerHTML=baseSecondary}else{if(stockPrice)stockPrice.textContent=basePrimary;if(stockSymbol)stockSymbol.innerHTML=baseSecondary}};
  const showReading=(price,range)=>{ticker.classList.add('chart-reading');if(isFund){if(fundSymbol)fundSymbol.textContent=price||basePrimary;const span=$('span',ticker);if(span)span.textContent=`${range||''} · ${$('#fundName')?.textContent||''}`}else{if(stockPrice)stockPrice.textContent=price||basePrimary;if(stockSymbol)stockSymbol.textContent=`${range||''} · ${$('#symbol')?.textContent||''}`}};
  requestAnimationFrame(()=>requestAnimationFrame(captureBase));
  if(!isFund&&moveEl&&'MutationObserver'in window){const moveObserver=new MutationObserver(()=>requestAnimationFrame(syncStockSecondary));moveObserver.observe(moveEl,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']})}

  const chartHost=isFund?$('#fundChart'):$('#chart');
  const assetCode=(new URLSearchParams(location.search).get('symbol')||$('#symbol')?.textContent||$('#fundSymbol')?.textContent||'').toUpperCase();
  const syncChartA11y=()=>{
    if(!chartHost)return;const range=$('.range button.on')?.dataset.range||'';chartHost.setAttribute('role','group');
    if(!isFund&&chartHost.classList.contains('is-kline')){const gran=$('.kline-granularity button.on')?.textContent?.trim()||'K线';chartHost.setAttribute('aria-label',`${assetCode} ${range} ${gran} 演示K线图。鼠标或手指横向移动可查看开高低收读数，键盘左右键也可浏览。`)}
    else chartHost.setAttribute('aria-label',`${assetCode} ${range} ${isFund?'ETF ':''}演示走势图。鼠标或手指横向移动可查看演示读数，键盘左右键也可浏览。`)
  };
  if(chartHost){requestAnimationFrame(()=>requestAnimationFrame(syncChartA11y));content.addEventListener('click',e=>{if(e.target.closest('.range button,.chart-view-toggle button,.kline-granularity button'))requestAnimationFrame(()=>requestAnimationFrame(syncChartA11y))})}
  if(chartHost&&'MutationObserver'in window){
    let lastVisible=false;
    const syncTip=()=>{
      const lineTip=$('.chart-scrub-tip',chartHost),klineTip=$('.kline-tip',chartHost);const lineVisible=!!lineTip&&lineTip.style.opacity==='1',klineVisible=!!klineTip&&klineTip.style.opacity==='1';
      if(lineVisible){const price=(lineTip.childNodes[0]?.textContent||lineTip.textContent||'').trim(),range=$('.range button.on')?.dataset.range||'';showReading(price,range)}
      else if(klineVisible){const raw=(klineTip.textContent||'').replace(/\s+/g,' '),match=raw.match(/收\s*\$?([\d,.]+)/),price=match?`$${match[1]}`:basePrimary,range=$('.range button.on')?.dataset.range||'';showReading(price,`${range} · K线`)}
      else if(lastVisible)restoreHeader();
      lastVisible=lineVisible||klineVisible;
    };
    const mo=new MutationObserver(()=>requestAnimationFrame(()=>{syncTip();syncChartA11y()}));mo.observe(chartHost,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});syncTip();
  }
})();
