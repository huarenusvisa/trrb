(function(){
  if(window.__financeReferenceFeaturesLoaded)return;window.__financeReferenceFeaturesLoaded=true;
  const D=window.FinanceData;if(!D)return;
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  if(!document.querySelector('link[data-finance-reference],link[href="./reference-features.css"],link[href$="/reference-features.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./reference-features.css';l.dataset.financeReference='1';document.head.appendChild(l)}
  const money=v=>typeof v==='number'?v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):v;
  function announce(text){let el=$('#financeReferenceAnnouncer');if(!el){el=document.createElement('div');el.id='financeReferenceAnnouncer';el.className='sr-only';el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');document.body.appendChild(el)}el.textContent='';requestAnimationFrame(()=>{el.textContent=text})}
  function notify(text){let t=$('#financeToast');if(!t){t=document.createElement('div');t.id='financeToast';t.className='finance-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t)}t.textContent=text;t.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.classList.remove('show'),2200)}

  function initWatchSorting(){
    const list=$('#watchlist');if(!list)return;
    const toolbar=list.previousElementSibling;const head=document.createElement('div');head.className='watch-column-head';head.hidden=true;head.setAttribute('aria-label','自选列表排序');
    head.innerHTML='<button type="button" data-sort-key="custom" aria-label="恢复自选原顺序">股票 <span class="sort-arrow">↕</span></button><span class="watch-trend-label">走势</span><button type="button" data-sort-key="price">最新价 <span class="sort-arrow">↕</span></button><button type="button" data-sort-key="change">涨跌幅 <span class="sort-arrow">↕</span></button>';
    if(toolbar&&toolbar.parentNode)toolbar.insertAdjacentElement('afterend',head);else list.insertAdjacentElement('beforebegin',head);
    let state={key:'custom',dir:'desc'};try{const saved=JSON.parse(localStorage.getItem('trfinance.watchSort')||'null');if(saved&&['custom','price','change'].includes(saved.key))state={key:saved.key,dir:saved.dir==='asc'?'asc':'desc'}}catch(e){}
    const save=()=>{try{localStorage.setItem('trfinance.watchSort',JSON.stringify(state))}catch(e){}};
    function resetIfCleared(){try{if(localStorage.getItem('trfinance.watchSort')===null&&state.key!=='custom')state={key:'custom',dir:'desc'}}catch(e){}}
    function infoFor(node){
      const link=node.matches('a[href]')?node:$('a[href]',node);if(!link)return null;let u;try{u=new URL(link.getAttribute('href'),location.href)}catch(e){return null}
      const symbol=(u.searchParams.get('symbol')||'').toUpperCase();if(!symbol)return null;const fund=/fund\.html$/i.test(u.pathname);const asset=fund?D.getFund(symbol):D.getQuote(symbol);if(!asset)return null;return {node,symbol,fund,price:Number(asset.price)||0,change:Number(asset.change)||0};
    }
    function customRank(info){const stocks=D.getWatchlist?D.getWatchlist():[],funds=D.getFundWatchlist?D.getFundWatchlist():[];if(info.fund){const i=funds.indexOf(info.symbol);return stocks.length+(i<0?999:i)}const i=stocks.indexOf(info.symbol);return i<0?999:i}
    function updateHead(){
      const rows=$$('.watch',list),manage=$$('.watch-manage-item',list),listMode=rows.length>0&&!manage.length;head.hidden=!listMode;
      $$('button[data-sort-key]',head).forEach(b=>{const key=b.dataset.sortKey,on=key===state.key;b.classList.toggle('is-sort',on);b.setAttribute('aria-pressed',String(on));const arrow=$('.sort-arrow',b);if(arrow)arrow.textContent=on?(state.key==='custom'?'↕':state.dir==='asc'?'↑':'↓'):'↕'});
    }
    let applying=false;
    function applySort(){
      if(applying)return;resetIfCleared();const candidates=[...list.children].filter(n=>n.matches('.watch,.watch-manage-item'));updateHead();if(candidates.length<2)return;
      const infos=candidates.map(infoFor).filter(Boolean);if(infos.length<2)return;
      const sorted=[...infos].sort((a,b)=>{if(state.key==='custom')return customRank(a)-customRank(b);const d=(a[state.key]-b[state.key])*(state.dir==='asc'?1:-1);return d||a.symbol.localeCompare(b.symbol)});
      const current=infos.map(x=>x.symbol).join('|'),next=sorted.map(x=>x.symbol).join('|');if(current===next)return;
      applying=true;sorted.forEach(x=>list.appendChild(x.node));requestAnimationFrame(()=>{applying=false;updateHead()});
    }
    head.addEventListener('click',e=>{const b=e.target.closest('button[data-sort-key]');if(!b)return;const key=b.dataset.sortKey;if(key==='custom')state={key:'custom',dir:'desc'};else if(state.key===key)state.dir=state.dir==='desc'?'asc':'desc';else state={key,dir:'desc'};save();applySort();announce(state.key==='custom'?'自选已恢复原顺序':`${state.key==='price'?'最新价':'涨跌幅'}已按${state.dir==='asc'?'从低到高':'从高到低'}排序`)});
    if('MutationObserver'in window)new MutationObserver(()=>requestAnimationFrame(applySort)).observe(list,{childList:true});
    document.addEventListener('click',e=>{if(e.target.closest('.watch-filter,.view-switch button,#watchManageBtn'))requestAnimationFrame(()=>requestAnimationFrame(applySort))},true);
    const clear=$('#clearLocalDataBtn');if(clear)clear.addEventListener('click',()=>setTimeout(()=>{if((D.getWatchlist?.()||[]).length===0&&(D.getFundWatchlist?.()||[]).length===0){try{localStorage.removeItem('trfinance.watchSort')}catch(e){}state={key:'custom',dir:'desc'};updateHead()}},0));
    window.addEventListener('finance:resume',()=>{const active=$('.watch-filter.on');if(active)active.click();requestAnimationFrame(()=>requestAnimationFrame(applySort))});
    window.addEventListener('storage',e=>{if(e.key==='trfinance.watchlist'||e.key==='trfinance.fundWatchlist'){const active=$('.watch-filter.on');if(active)active.click()}});
    applySort();
  }

  function initStockReferenceFeatures(){
    const chartEl=$('#chart'),range=$('.range'),move=$('#move'),advanced=$('#advancedChartBtn');if(!chartEl||!range||!move)return;
    const symbol=(new URLSearchParams(location.search).get('symbol')||'AAPL').toUpperCase(),q=D.getQuote(symbol);if(!q)return;
    const labelMap={1D:'今日',1W:'1周',1M:'1个月',3M:'3个月',YTD:'年初至今',1Y:'1年',5Y:'5年'};
    const spreadMap={1D:.025,1W:.045,1M:.07,3M:.10,YTD:.13,1Y:.18,5Y:.34};
    let mode='line',granularity='day';
    const bar=document.createElement('div');bar.className='chart-viewbar';bar.innerHTML='<div class="chart-view-toggle" role="group" aria-label="图表类型"><button type="button" class="on" data-chart-view="line" aria-pressed="true">走势</button><button type="button" data-chart-view="kline" aria-pressed="false">K线</button></div><div class="kline-granularity" role="group" aria-label="K线周期" hidden><button type="button" class="on" data-kline="day" aria-pressed="true">日K</button><button type="button" data-kline="week" aria-pressed="false">周K</button><button type="button" data-kline="month" aria-pressed="false">月K</button></div><span class="chart-demo-tag">Demo chart</span>';
    chartEl.insertAdjacentElement('beforebegin',bar);if(advanced)advanced.hidden=true;
    const viewButtons=$$('button[data-chart-view]',bar),granularityBox=$('.kline-granularity',bar),granularityButtons=$$('button[data-kline]',bar);
    function activeRange(){return $('.range button[data-range].on')?.dataset.range||'1D'}
    function normalizedSeries(rangeKey){
      if(rangeKey==='1D')return [q.prev,q.open,(q.open+q.high)/2,q.low,(q.low+q.price)/2,q.price];
      const raw=D.spark(q.symbol)||[],n={1W:18,1M:26,3M:32,YTD:38,1Y:44,5Y:52}[rangeKey]||26,spread=spreadMap[rangeKey]||.08;
      const src=Array.from({length:n},(_,i)=>{const base=raw.length?raw[i%raw.length]:50;return base+Math.sin((i+q.symbol.length)/3)*2.2+Math.cos(i/5)*1.4+(i%7)*.18});
      const max=Math.max(...src),min=Math.min(...src);let prices=src.map(v=>q.price*(1-spread+((v-min)/(max-min||1))*spread*2));const offset=q.price-prices[prices.length-1];prices=prices.map(v=>Math.max(.01,v+offset));return prices;
    }
    function periodStats(rangeKey){if(rangeKey==='1D')return {amount:q.price-q.prev,pct:q.change};const p=normalizedSeries(rangeKey),start=p[0]||q.price,amount=q.price-start,pct=start?amount/start*100:0;return {amount,pct}}
    function updatePeriodMove(rangeKey){const s=periodStats(rangeKey),up=s.pct>=0;move.className=`move ${up?'up':'down'}`;move.innerHTML=`${up?'▲':'▼'} $${Math.abs(s.amount).toFixed(2)} (${Math.abs(s.pct).toFixed(2)}%) <span class="period-demo-note">${labelMap[rangeKey]||rangeKey}${rangeKey==='1D'?'':' · 演示区间'}</span>`}
    function candlesFor(rangeKey){
      let closes=normalizedSeries(rangeKey);const step=granularity==='day'?1:granularity==='week'?2:4;if(step>1)closes=closes.filter((_,i)=>i%step===0||i===closes.length-1);const volBase=Math.max(1,Number(String(q.volume||'').replace(/[^0-9.]/g,''))||100);
      return closes.map((close,i)=>{const prev=i?closes[i-1]:close*(1-(q.change||0)/100*.15),open=prev*(1+Math.sin((i+3)*1.7)*.0035),wiggle=Math.max(close*.003,Math.abs(close-open)*.42),high=Math.max(open,close)+wiggle*(1+(i%3)*.25),low=Math.max(.01,Math.min(open,close)-wiggle*(.8+(i%4)*.18)),volume=volBase*(.55+((i*17+q.symbol.length*11)%47)/50);return {open,high,low,close,volume}})
    }
    function renderKline(){
      const rangeKey=activeRange(),candles=candlesFor(rangeKey),w=800,h=400,priceBottom=318,volTop=332,volBottom=386,max=Math.max(...candles.map(c=>c.high)),min=Math.min(...candles.map(c=>c.low)),maxVol=Math.max(...candles.map(c=>c.volume)),xStep=w/Math.max(1,candles.length),bodyW=Math.max(3,Math.min(14,xStep*.56)),y=v=>24+(max-v)/(max-min||1)*(priceBottom-42),pieces=[];
      [0.25,.5,.75].forEach(r=>{const yy=24+r*(priceBottom-42);pieces.push(`<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="#edf1ef" stroke-width="1"/>`)});
      candles.forEach((c,i)=>{const x=xStep*(i+.5),up=c.close>=c.open,color=up?'#00c805':'#ff4d2e',yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low),top=Math.min(yo,yc),bh=Math.max(2,Math.abs(yc-yo)),vh=(c.volume/maxVol)*(volBottom-volTop);pieces.push(`<g data-candle="${i}"><line x1="${x}" y1="${yh}" x2="${x}" y2="${yl}" stroke="${color}" stroke-width="1.5"/><rect x="${x-bodyW/2}" y="${top}" width="${bodyW}" height="${bh}" rx="1" fill="${up?'#fff':color}" stroke="${color}" stroke-width="1.7"/><rect x="${x-bodyW/2}" y="${volBottom-vh}" width="${bodyW}" height="${vh}" rx="1" fill="${color}" opacity=".28"/></g>`)});
      pieces.push('<g data-kline-cross visibility="hidden" pointer-events="none"><line data-kline-line x1="0" x2="0" y1="20" y2="388" stroke="#6f777d" stroke-width="1" stroke-dasharray="3 4" opacity=".7"/></g>');
      chartEl.classList.add('is-kline');chartEl.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${q.symbol} ${labelMap[rangeKey]||rangeKey} 演示K线图，${granularity==='day'?'日K':granularity==='week'?'周K':'月K'}">${pieces.join('')}</svg>`;const tip=document.createElement('div');tip.className='kline-tip';tip.setAttribute('aria-hidden','true');chartEl.appendChild(tip);chartEl.tabIndex=0;chartEl.style.touchAction='pan-y';let selected=candles.length-1,touching=false,raf=0;const lineEl=$('[data-kline-line]',chartEl),cross=$('[data-kline-cross]',chartEl);
      const hide=()=>{cross?.setAttribute('visibility','hidden');tip.style.opacity='0';tip.style.transform='translateY(3px)'};
      const show=i=>{selected=Math.max(0,Math.min(candles.length-1,i));const c=candles[selected],x=xStep*(selected+.5),rect=chartEl.getBoundingClientRect(),px=(x/w)*rect.width;if(lineEl){lineEl.setAttribute('x1',x);lineEl.setAttribute('x2',x)}cross?.setAttribute('visibility','visible');tip.innerHTML=`开 $${money(c.open)}　高 $${money(c.high)}<br>低 $${money(c.low)}　收 $${money(c.close)}<small>演示K线 · ${granularity==='day'?'日K':granularity==='week'?'周K':'月K'} · ${labelMap[rangeKey]||rangeKey}</small>`;tip.style.left=`${Math.max(6,Math.min(rect.width-190,px>rect.width*.7?px-184:px+8))}px`;tip.style.opacity='1';tip.style.transform='translateY(0)'};
      const fromPointer=e=>{const r=chartEl.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),i=Math.floor((x/r.width)*candles.length);cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>show(i))};
      chartEl.onpointerenter=e=>{if(e.pointerType!=='touch')fromPointer(e)};chartEl.onpointermove=e=>{if(e.pointerType!=='touch'||touching)fromPointer(e)};chartEl.onpointerleave=e=>{if(e.pointerType!=='touch')hide()};chartEl.onpointerdown=e=>{if(e.pointerType==='touch'){touching=true;fromPointer(e)}};chartEl.onpointerup=chartEl.onpointercancel=()=>{touching=false;hide()};chartEl.onfocus=()=>show(selected);chartEl.onblur=hide;chartEl.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(selected+(e.key==='ArrowRight'?1:-1))}else if(e.key==='Home'){e.preventDefault();show(0)}else if(e.key==='End'){e.preventDefault();show(candles.length-1)}else if(e.key==='Escape')hide()};
    }
    function setMode(next){mode=next;viewButtons.forEach(b=>{const on=b.dataset.chartView===mode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});granularityBox.hidden=mode!=='kline';if(mode==='kline'){renderKline();notify('已切换到 K 线演示图')}else{chartEl.classList.remove('is-kline');const b=$('.range button[data-range].on');if(b)b.click();notify('已切换到走势演示图')}}
    viewButtons.forEach(b=>b.addEventListener('click',()=>{if(b.dataset.chartView!==mode)setMode(b.dataset.chartView)}));
    granularityButtons.forEach(b=>b.addEventListener('click',()=>{granularity=b.dataset.kline;granularityButtons.forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});if(mode==='kline')renderKline();announce(`已切换到${b.textContent}`)}));
    range.addEventListener('click',e=>{const b=e.target.closest('button[data-range]');if(!b)return;if(mode==='kline'){e.preventDefault();e.stopImmediatePropagation();$$('.range button[data-range]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});updatePeriodMove(b.dataset.range);renderKline();announce(`K线区间已切换到${labelMap[b.dataset.range]||b.dataset.range}`)}else requestAnimationFrame(()=>updatePeriodMove(b.dataset.range))},true);
    updatePeriodMove(activeRange());
  }

  initWatchSorting();initStockReferenceFeatures();
})();
