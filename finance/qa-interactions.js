(function(){
  if(window.FinanceQaInteractions)return;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const result=(name,ok,detail='',status='fail')=>({name,status:ok?'pass':status,detail:detail||(ok?'通过':'未通过')});
  function snapshot(storage){const out={};try{for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&k.startsWith('trfinance.'))out[k]=storage.getItem(k)}}catch(e){}return out}
  function restore(storage,snap){try{const keys=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&k.startsWith('trfinance.'))keys.push(k)}keys.forEach(k=>storage.removeItem(k));Object.entries(snap).forEach(([k,v])=>storage.setItem(k,v))}catch(e){}}
  function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
  function key(win,el,keyName){el.dispatchEvent(new win.KeyboardEvent('keydown',{key:keyName,bubbles:true,cancelable:true}))}
  async function home(win,items){
    const d=win.document,$=s=>d.querySelector(s),$$=s=>Array.from(d.querySelectorAll(s));
    const input=$('#searchInput'),box=$('#searchResults');
    if(input&&box){
      input.value='AAPL';input.dispatchEvent(new win.Event('input',{bubbles:true}));await sleep(45);
      const hit=$('.search-hit[href*="AAPL"]');items.push(result('交互：搜索 AAPL 生成真实结果',!!hit,hit?text(hit):'未找到 AAPL 搜索结果'));
      key(win,input,'ArrowDown');await sleep(15);const active=$('.search-hit.active');items.push(result('交互：搜索键盘高亮与 ARIA 同步',!!active&&input.getAttribute('aria-activedescendant')===active.id,active?`active=${active.id}`:'没有 active 搜索项'));
      key(win,input,'Escape');await sleep(25);items.push(result('交互：Escape 完整关闭搜索',!box.classList.contains('open')&&input.getAttribute('aria-expanded')==='false'&&!input.hasAttribute('aria-activedescendant')&&!$('.search-hit.active'),`expanded=${input.getAttribute('aria-expanded')}`));
      input.value='';input.dispatchEvent(new win.Event('input',{bubbles:true}));
    }else items.push(result('交互：搜索控件可操作',false,'缺少搜索框或结果容器'));

    const navFunds=$('.bottom button[data-target="funds"]'),navWatch=$('.bottom button[data-target="watch"]'),navMarket=$('.bottom button[data-target="market"]');
    if(navFunds&&navWatch&&navMarket){
      navFunds.click();await sleep(25);items.push(result('交互：一级导航切换到基金',!!$('.page[data-page="funds"].active')&&win.location.hash==='#funds',`hash=${win.location.hash}`));
      navWatch.click();await sleep(25);items.push(result('交互：一级导航切换到自选',!!$('.page[data-page="watch"].active')&&win.location.hash==='#watch',`hash=${win.location.hash}`));
      const priceSort=$('.watch-column-head button[data-sort-key="price"]');
      if(priceSort){priceSort.click();await sleep(35);let saved=null;try{saved=JSON.parse(win.localStorage.getItem('trfinance.watchSort')||'null')}catch(e){}items.push(result('交互：最新价排序真实生效',priceSort.getAttribute('aria-pressed')==='true'&&saved?.key==='price',saved?JSON.stringify(saved):'未保存排序状态'));const custom=$('.watch-column-head button[data-sort-key="custom"]');custom?.click();await sleep(20)}
      else items.push(result('交互：自选排序按钮可操作',false,'缺少最新价排序按钮'));
      navFunds.click();await sleep(25);const gold=$('.fund-cat[data-fund-filter="gold"]');if(gold){gold.click();await sleep(30);const fundLinks=$$('#fundList a.fund'),status=text($('#fundFilterStatus'));items.push(result('交互：黄金主题真实筛选 ETF',gold.getAttribute('aria-pressed')==='true'&&fundLinks.length===1&&fundLinks[0].getAttribute('href')?.includes('GLD')&&status.includes('黄金'),`${status} · ${fundLinks.length} 条`));gold.click();await sleep(20)}else items.push(result('交互：ETF 主题筛选可操作',false,'缺少黄金主题按钮'));
      navMarket.click();await sleep(20);
    }else items.push(result('交互：四栏导航可操作',false,'缺少行情/自选/基金导航按钮'));
  }
  async function stock(win,items){
    const d=win.document,$=s=>d.querySelector(s),$$=s=>Array.from(d.querySelectorAll(s));
    const lineBtn=$('.chart-view-toggle button[data-chart-view="line"]'),klineBtn=$('.chart-view-toggle button[data-chart-view="kline"]'),chart=$('#chart');
    if(klineBtn&&lineBtn&&chart){
      klineBtn.click();await sleep(45);let active=$('.range button.on');items.push(result('交互：走势切换到 K线',chart.classList.contains('is-kline')&&active?.dataset.range==='1M',`active=${active?.dataset.range||'none'}`));
      const d1=$('.range button[data-range="1D"]'),w1=$('.range button[data-range="1W"]');items.push(result('交互：日K最短区间约束',!!d1?.disabled&&!!w1?.disabled,`1D=${!!d1?.disabled}, 1W=${!!w1?.disabled}`));
      const week=$('.kline-granularity button[data-kline="week"]');week?.click();await sleep(35);active=$('.range button.on');const m1=$('.range button[data-range="1M"]');items.push(result('交互：周K自动提升到 3M',active?.dataset.range==='3M'&&!!m1?.disabled,`active=${active?.dataset.range||'none'}`));
      const month=$('.kline-granularity button[data-kline="month"]');month?.click();await sleep(35);active=$('.range button.on');const ytd=$('.range button[data-range="YTD"]');items.push(result('交互：月K自动提升到 1Y',active?.dataset.range==='1Y'&&!!ytd?.disabled,`active=${active?.dataset.range||'none'}`));
      chart.focus();key(win,chart,'ArrowLeft');await sleep(25);const kTip=$('.kline-tip');items.push(result('交互：K线键盘读取 OHLC',kTip?.style.opacity==='1'&&text(kTip).includes('收'),kTip?text(kTip).slice(0,80):'缺少 K线读数'));key(win,chart,'Escape');
      lineBtn.click();await sleep(45);items.push(result('交互：切回走势后解除 K线区间禁用',!chart.classList.contains('is-kline')&&$$('.range button[data-range]').every(b=>!b.disabled),'走势模式恢复'));
      const ytdBtn=$('.range button[data-range="YTD"]');ytdBtn?.click();await sleep(70);const move=$('#move'),top=$('#topSymbol'),pct=text(move).match(/\([^)]*\)/)?.[0]||'';items.push(result('交互：YTD 收益同步 sticky 顶部',!!pct&&text(move).includes('年初至今')&&text(top).includes(pct),`move=${text(move)} · top=${text(top)}`));
      chart.focus();key(win,chart,'ArrowLeft');await sleep(25);const tip=$('.chart-scrub-tip');items.push(result('交互：走势图键盘读取价格',tip?.style.opacity==='1'&&text(tip).includes('演示读数'),tip?text(tip):'缺少走势读数'));key(win,chart,'Escape');
    }else items.push(result('交互：个股图表模式控件可操作',false,'缺少走势/K线控件'));
  }
  async function fund(win,items){
    const d=win.document,$=s=>d.querySelector(s);const ytd=$('.range button[data-range="YTD"]'),chart=$('#fundChart');
    if(ytd&&chart){ytd.click();await sleep(45);items.push(result('交互：ETF YTD 区间真实重绘',ytd.classList.contains('on')&&!!$('#fundChart svg'),`active=${ytd.classList.contains('on')}`));chart.focus();key(win,chart,'ArrowLeft');await sleep(25);const tip=$('.chart-scrub-tip');items.push(result('交互：ETF 图表键盘读取价格',tip?.style.opacity==='1'&&text(tip).includes('演示读数'),tip?text(tip):'缺少 ETF 图表读数'));key(win,chart,'Escape');await sleep(15);items.push(result('交互：ETF Escape 关闭图表读数',tip?.style.opacity!=='1','读数已隐藏'))}
    else items.push(result('交互：ETF 图表控件可操作',false,'缺少 ETF 图表或 YTD 按钮'));
  }
  async function run(win,type){
    const local=snapshot(win.localStorage),session=snapshot(win.sessionStorage),hash=win.location.hash,items=[];
    try{if(type==='home')await home(win,items);else if(type==='stock')await stock(win,items);else if(type==='fund')await fund(win,items);else items.push(result('交互验收页面类型',false,`未知页面类型 ${type}`))}
    catch(e){items.push(result('交互验收执行完成',false,e?.message||String(e)))}
    finally{restore(win.localStorage,local);restore(win.sessionStorage,session);try{if(win.location.hash!==hash)win.history.replaceState(null,'',`${win.location.pathname}${win.location.search}${hash}`)}catch(e){}}
    return items;
  }
  window.FinanceQaInteractions={run};
})();
