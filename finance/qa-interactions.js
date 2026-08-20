(function(){
  if(window.FinanceQaInteractions)return;
  let activeSignal=null;
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  function abortError(){const e=new Error('QA interaction aborted');e.name='AbortError';return e}
  function checkAbort(){if(activeSignal?.aborted)throw abortError()}
  async function sleep(ms){checkAbort();await delay(ms);checkAbort()}
  const result=(name,ok,detail='',status='fail')=>({name,status:ok?'pass':status,detail:detail||(ok?'通过':'未通过')});
  function snapshot(storage){const out={};try{for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&k.startsWith('trfinance.'))out[k]=storage.getItem(k)}}catch(e){}return out}
  function restore(storage,snap){try{const keys=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k&&k.startsWith('trfinance.'))keys.push(k)}keys.forEach(k=>storage.removeItem(k));Object.entries(snap).forEach(([k,v])=>storage.setItem(k,v))}catch(e){}}
  function sameSnapshot(a,b){const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&a[k]===b[k])}
  const sameList=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
  function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
  function key(win,el,keyName){checkAbort();el.dispatchEvent(new win.KeyboardEvent('keydown',{key:keyName,bubbles:true,cancelable:true}))}
  async function waitFor(fn,{timeout=900,interval=24}={}){const start=Date.now();let value;while(Date.now()-start<timeout){checkAbort();try{value=fn();if(value)return value}catch(e){}await sleep(interval)}checkAbort();try{return fn()||null}catch(e){return null}}
  async function clickAndWait(el,fn,opts){checkAbort();if(!el)return null;el.click();return waitFor(fn,opts)}
  function isHidden(win,el){if(!el)return true;const s=win.getComputedStyle(el);return !!el.hidden||s.display==='none'||s.visibility==='hidden'||el.closest('[hidden],[aria-hidden="true"],[inert]')!=null}
  function preventNavigationOnce(link){if(!link)return;link.addEventListener('click',e=>e.preventDefault(),{once:true});link.click()}
  function dispatchPersistedPageShow(win){const e=new win.Event('pageshow');try{Object.defineProperty(e,'persisted',{value:true})}catch(err){}win.dispatchEvent(e)}
  function addSurfaceAudit(win,items,label){
    checkAbort();const audit=win.FinanceAcceptance?.auditSurface?.();if(!audit){items.push(result(`交互：${label}页面审计`,false,'FinanceAcceptance.auditSurface 不可用','warn'));return}
    items.push(result(`交互：${label}无横向溢出`,audit.overflow<=3,`scrollWidth 差值 ${audit.overflow}px`));
    items.push(result(`交互：${label}固定底栏正文预留`,audit.fixedClearance?.ok!==false,audit.fixedClearance?.detail||'无固定底栏'));
    items.push(result(`交互：${label}韧性状态一致`,audit.resilience?.ok===true,audit.resilience?.detail||'缺少韧性状态快照'));
    items.push(result(`交互：${label}无交易/开户动作入口`,audit.forbidden.length===0,audit.forbidden.length?audit.forbidden.join('；'):'未发现禁区动作入口'));
    items.push(result(`交互：${label}控件名称完整`,audit.unnamed.length===0,audit.unnamed.length?`缺少名称：${audit.unnamed.join('；')}`:'可操作控件均有可访问名称'));
    items.push(result(`交互：${label}全长触控目标`,audit.targets.weak.length===0,audit.targets.weak.length?`小于${audit.targets.limit}px：${audit.targets.weak.join('；')}`:`未发现小于${audit.targets.limit}px的可操作目标`,'warn'))
  }
  async function verifyExactUndo(win,items,$,$$){
    const D=win.FinanceData,manage=$('#watchManageBtn');if(!D||!manage){items.push(result('交互：自选撤销精确恢复',false,'缺少 FinanceData 或管理入口'));return}
    const beforeStocks=D.getWatchlist(),beforeFunds=D.getFundWatchlist();
    if(manage.getAttribute('aria-pressed')!=='true')await clickAndWait(manage,()=>manage.getAttribute('aria-pressed')==='true');
    const remove=$('.watch-remove[data-symbol="AAPL"][data-type="stock"]');if(!remove){items.push(result('交互：自选撤销精确恢复',false,'管理模式下缺少 AAPL 移除按钮'));if(manage.getAttribute('aria-pressed')==='true')manage.click();return}
    remove.click();const removed=await waitFor(()=>!D.getWatchlist().includes('AAPL')&&$('#financeToast button'));if(!removed){items.push(result('交互：删除 AAPL 后出现撤销入口',false,'删除或撤销 Toast 未建立'));return}
    const concurrent=D.getWatchlist().filter(s=>s!=='AMZN');concurrent.push('AMZN');D.setWatchlist(concurrent);
    const undo=$('#financeToast button');undo?.click();const restored=await waitFor(()=>sameList(D.getWatchlist(),beforeStocks)&&sameList(D.getFundWatchlist(),beforeFunds),{timeout:1200});
    items.push(result('交互：自选撤销恢复删除前精确快照',!!restored,restored?`stocks=${D.getWatchlist().join(',')} · funds=${D.getFundWatchlist().join(',')||'空'}`:`stocks=${D.getWatchlist().join(',')} · expected=${beforeStocks.join(',')}`));
    if(manage.getAttribute('aria-pressed')==='true')await clickAndWait(manage,()=>manage.getAttribute('aria-pressed')==='false')
  }
  async function verifyContextRestore(win,items,$,$$,{kind}){
    const nav=win.FinanceNavigationMemory;if(!nav){items.push(result(`交互：${kind}详情来源恢复`,false,'FinanceNavigationMemory 不可用'));return}
    nav.clearContext();
    const pageTarget=kind==='watch'?'watch':'funds',pageBtn=$(`.bottom button[data-target="${pageTarget}"]`),marketBtn=$('.bottom button[data-target="market"]');
    if(!pageBtn||!marketBtn){items.push(result(`交互：${kind}详情来源恢复`,false,'缺少一级导航按钮'));return}
    await clickAndWait(pageBtn,()=> $(`.page[data-page="${pageTarget}"].active`));
    let filter,link;
    if(kind==='watch'){
      filter=$('.watch-filter[data-filter="us"]');if(filter)await clickAndWait(filter,()=>filter.getAttribute('aria-pressed')==='true');link=$('#watchlist a.watch[href*="AAPL"]')
    }else{
      filter=$('.fund-cat[data-fund-filter="gold"]');if(filter&&filter.getAttribute('aria-pressed')!=='true')await clickAndWait(filter,()=>filter.getAttribute('aria-pressed')==='true');link=$('#fundList a.fund[href*="GLD"]')
    }
    if(!filter||!link){items.push(result(`交互：${kind}详情来源捕获`,false,'缺少筛选按钮或详情链接'));return}
    const maxY=Math.max(0,Math.min(180,win.document.documentElement.scrollHeight-win.innerHeight));win.scrollTo({top:maxY,behavior:'auto'});await sleep(40);
    preventNavigationOnce(link);const captured=await waitFor(()=>{const c=nav.getContext?.();return c&&c.page===pageTarget&&c.href?.includes(kind==='watch'?'AAPL':'GLD')?c:null});
    const filterOk=kind==='watch'?captured?.watchFilter==='us':captured?.fundFilter==='gold';items.push(result(`交互：${kind==='watch'?'自选':'基金'}详情来源与筛选被捕获`,!!captured&&filterOk,captured?JSON.stringify({page:captured.page,watchFilter:captured.watchFilter,fundFilter:captured.fundFilter,scrollY:captured.scrollY,href:captured.href}):'未写入 navContext'));
    if(!captured)return;
    nav.markReturn();
    if(kind==='watch')$('.watch-filter[data-filter="all"]')?.click();else if(filter.getAttribute('aria-pressed')==='true')filter.click();
    await clickAndWait(marketBtn,()=>$('.page[data-page="market"].active'));win.scrollTo({top:0,behavior:'auto'});await sleep(40);
    let announcer=$('#financeAnnouncer');if(!announcer){announcer=win.document.createElement('div');announcer.id='financeAnnouncer';announcer.setAttribute('aria-live','polite');win.document.body.appendChild(announcer)}announcer.textContent='qa-restore-sentinel';
    dispatchPersistedPageShow(win);
    const restored=await waitFor(()=>{
      const pageOn=!!$(`.page[data-page="${pageTarget}"].active`),filterOn=filter.getAttribute('aria-pressed')==='true',scrollOk=Math.abs((win.scrollY||0)-(captured.scrollY||0))<=24;return pageOn&&filterOn&&scrollOk?{pageOn,filterOn,scrollOk}:null
    },{timeout:1600});
    await sleep(80);const silent=announcer.textContent==='qa-restore-sentinel'&&!nav.isRestoring?.();
    items.push(result(`交互：${kind==='watch'?'自选→股票':'基金→ETF'} BFCache 上下文恢复`,!!restored,restored?`page=${pageTarget} · filter=${kind==='watch'?'us':'gold'} · scroll=${Math.round(win.scrollY||0)}`:`page=${$('.page.active')?.dataset.page||'none'} · scroll=${Math.round(win.scrollY||0)}`));
    items.push(result('交互：导航恢复不触发用户操作播报',silent,`liveRegion=${announcer.textContent||'空'} · restoring=${!!nav.isRestoring?.()}`));
    nav.clearContext()
  }
  async function home(win,items){
    const d=win.document,$=s=>d.querySelector(s),$$=s=>Array.from(d.querySelectorAll(s));
    const input=$('#searchInput'),box=$('#searchResults');
    if(input&&box){
      input.value='AAPL';input.dispatchEvent(new win.Event('input',{bubbles:true}));
      const hit=await waitFor(()=>$('.search-hit[href*="AAPL"]'));items.push(result('交互：搜索 AAPL 生成真实结果',!!hit,hit?text(hit):'未找到 AAPL 搜索结果'));
      key(win,input,'ArrowDown');const active=await waitFor(()=>$('.search-hit.active'));items.push(result('交互：搜索键盘高亮与 ARIA 同步',!!active&&input.getAttribute('aria-activedescendant')===active.id,active?`active=${active.id}`:'没有 active 搜索项'));
      key(win,input,'Escape');const closed=await waitFor(()=>!box.classList.contains('open')&&input.getAttribute('aria-expanded')==='false'&&!input.hasAttribute('aria-activedescendant')&&!$('.search-hit.active'));items.push(result('交互：Escape 完整关闭搜索',!!closed,`expanded=${input.getAttribute('aria-expanded')}`));
      input.value='';input.dispatchEvent(new win.Event('input',{bubbles:true}));
    }else items.push(result('交互：搜索控件可操作',false,'缺少搜索框或结果容器'));

    const navFunds=$('.bottom button[data-target="funds"]'),navWatch=$('.bottom button[data-target="watch"]'),navProfile=$('.bottom button[data-target="profile"]'),navMarket=$('.bottom button[data-target="market"]');
    if(navFunds&&navWatch&&navProfile&&navMarket){
      const fundsOn=await clickAndWait(navFunds,()=>$('.page[data-page="funds"].active')&&win.location.hash==='#funds');items.push(result('交互：一级导航切换到基金',!!fundsOn,`hash=${win.location.hash}`));addSurfaceAudit(win,items,'基金页');
      const watchOn=await clickAndWait(navWatch,()=>$('.page[data-page="watch"].active')&&win.location.hash==='#watch');items.push(result('交互：一级导航切换到自选',!!watchOn,`hash=${win.location.hash}`));addSurfaceAudit(win,items,'自选页');
      const priceSort=$('.watch-column-head button[data-sort-key="price"]');
      if(priceSort){priceSort.click();const saved=await waitFor(()=>{try{const v=JSON.parse(win.localStorage.getItem('trfinance.watchSort')||'null');return v?.key==='price'?v:null}catch(e){return null}});items.push(result('交互：最新价排序真实生效',priceSort.getAttribute('aria-pressed')==='true'&&!!saved,saved?JSON.stringify(saved):'未保存排序状态'));const custom=$('.watch-column-head button[data-sort-key="custom"]');if(custom){custom.click();await waitFor(()=>custom.getAttribute('aria-pressed')==='true')}}
      else items.push(result('交互：自选排序按钮可操作',false,'缺少最新价排序按钮'));
      await verifyExactUndo(win,items,$,$$);
      await verifyContextRestore(win,items,$,$$,{kind:'watch'});
      await clickAndWait(navFunds,()=>$('.page[data-page="funds"].active'));
      const gold=$('.fund-cat[data-fund-filter="gold"]');if(gold){if(gold.getAttribute('aria-pressed')!=='true')gold.click();const filtered=await waitFor(()=>{const links=$$('#fundList a.fund'),status=text($('#fundFilterStatus'));return gold.getAttribute('aria-pressed')==='true'&&links.length===1&&links[0].getAttribute('href')?.includes('GLD')&&status.includes('黄金')?{links,status}:null});items.push(result('交互：黄金主题真实筛选 ETF',!!filtered,filtered?`${filtered.status} · ${filtered.links.length} 条`:`${text($('#fundFilterStatus'))} · ${$$('#fundList a.fund').length} 条`));if(gold.getAttribute('aria-pressed')==='true'){gold.click();await waitFor(()=>gold.getAttribute('aria-pressed')==='false')}}
      else items.push(result('交互：ETF 主题筛选可操作',false,'缺少黄金主题按钮'));
      await verifyContextRestore(win,items,$,$$,{kind:'fund'});
      const profileOn=await clickAndWait(navProfile,()=>$('.page[data-page="profile"].active')&&win.location.hash==='#profile');items.push(result('交互：一级导航切换到我的',!!profileOn,`hash=${win.location.hash}`));addSurfaceAudit(win,items,'我的页');
      const marketOn=await clickAndWait(navMarket,()=>$('.page[data-page="market"].active')&&win.location.hash==='#market');items.push(result('交互：一级导航返回行情',!!marketOn,`hash=${win.location.hash}`));addSurfaceAudit(win,items,'行情页');
    }else items.push(result('交互：四栏导航可操作',false,'缺少行情/自选/基金/我的导航按钮'));
  }
  async function stock(win,items){
    const d=win.document,$=s=>d.querySelector(s),$$=s=>Array.from(d.querySelectorAll(s));
    const lineBtn=$('.chart-view-toggle button[data-chart-view="line"]'),klineBtn=$('.chart-view-toggle button[data-chart-view="kline"]'),chart=$('#chart');
    if(klineBtn&&lineBtn&&chart){
      klineBtn.click();let active=await waitFor(()=>{const a=$('.range button.on');return chart.classList.contains('is-kline')&&a?.dataset.range==='1M'?a:null});items.push(result('交互：走势切换到 K线',!!active,`active=${$('.range button.on')?.dataset.range||'none'}`));
      const d1=$('.range button[data-range="1D"]'),w1=$('.range button[data-range="1W"]');items.push(result('交互：日K最短区间约束',!!d1?.disabled&&!!w1?.disabled,`1D=${!!d1?.disabled}, 1W=${!!w1?.disabled}`));
      const week=$('.kline-granularity button[data-kline="week"]');week?.click();active=await waitFor(()=>{const a=$('.range button.on'),m1=$('.range button[data-range="1M"]');return a?.dataset.range==='3M'&&m1?.disabled?a:null});items.push(result('交互：周K自动提升到 3M',!!active,`active=${$('.range button.on')?.dataset.range||'none'}`));
      const month=$('.kline-granularity button[data-kline="month"]');month?.click();active=await waitFor(()=>{const a=$('.range button.on'),ytd=$('.range button[data-range="YTD"]');return a?.dataset.range==='1Y'&&ytd?.disabled?a:null});items.push(result('交互：月K自动提升到 1Y',!!active,`active=${$('.range button.on')?.dataset.range||'none'}`));
      const klineA11y=await waitFor(()=>{const label=chart.getAttribute('aria-label')||'';return chart.getAttribute('role')==='group'&&label.includes('K线')&&label.includes('月K')&&label.includes('1Y')?label:null});items.push(result('交互：K线辅助语义同步',!!klineA11y,klineA11y||`role=${chart.getAttribute('role')} · label=${chart.getAttribute('aria-label')||''}`));
      chart.focus();key(win,chart,'ArrowLeft');const kTip=await waitFor(()=>{const t=$('.kline-tip');return t?.style.opacity==='1'&&text(t).includes('收')?t:null});items.push(result('交互：K线键盘读取 OHLC',!!kTip,kTip?text(kTip).slice(0,80):'缺少 K线读数'));key(win,chart,'Escape');await waitFor(()=>$('.kline-tip')?.style.opacity!=='1');
      lineBtn.click();const lineReady=await waitFor(()=>!chart.classList.contains('is-kline')&&$$('.range button[data-range]').every(b=>!b.disabled));items.push(result('交互：切回走势后解除 K线区间禁用',!!lineReady,'走势模式恢复'));
      const lineA11y=await waitFor(()=>{const label=chart.getAttribute('aria-label')||'';return chart.getAttribute('role')==='group'&&label.includes('走势图')&&!label.includes('K线')?label:null});items.push(result('交互：走势辅助语义恢复',!!lineA11y,lineA11y||`role=${chart.getAttribute('role')} · label=${chart.getAttribute('aria-label')||''}`));
      const ytdBtn=$('.range button[data-range="YTD"]');ytdBtn?.click();const ytdSync=await waitFor(()=>{const move=$('#move'),top=$('#topSymbol'),pct=text(move).match(/\([^)]*\)/)?.[0]||'';return pct&&text(move).includes('年初至今')&&text(top).includes(pct)?{move:text(move),top:text(top)}:null},{timeout:1200});items.push(result('交互：YTD 收益同步 sticky 顶部',!!ytdSync,ytdSync?`move=${ytdSync.move} · top=${ytdSync.top}`:`move=${text($('#move'))} · top=${text($('#topSymbol'))}`));
      chart.focus();key(win,chart,'ArrowLeft');const tip=await waitFor(()=>{const t=$('.chart-scrub-tip');return t?.style.opacity==='1'&&text(t).includes('演示读数')?t:null});items.push(result('交互：走势图键盘读取价格',!!tip,tip?text(tip):'缺少走势读数'));key(win,chart,'Escape');await waitFor(()=>$('.chart-scrub-tip')?.style.opacity!=='1');
      addSurfaceAudit(win,items,'个股详情交互后');
    }else items.push(result('交互：个股图表模式控件可操作',false,'缺少走势/K线控件'));
  }
  async function fund(win,items){
    const d=win.document,$=s=>d.querySelector(s);const ytd=$('.range button[data-range="YTD"]'),chart=$('#fundChart');
    if(ytd&&chart){ytd.click();const redrawn=await waitFor(()=>ytd.classList.contains('on')&&!!$('#fundChart svg'));items.push(result('交互：ETF YTD 区间真实重绘',!!redrawn,`active=${ytd.classList.contains('on')}`));const fundA11y=await waitFor(()=>{const label=chart.getAttribute('aria-label')||'';return chart.getAttribute('role')==='group'&&label.includes('ETF')&&label.includes('YTD')&&label.includes('走势图')?label:null});items.push(result('交互：ETF 图表辅助语义同步',!!fundA11y,fundA11y||`role=${chart.getAttribute('role')} · label=${chart.getAttribute('aria-label')||''}`));chart.focus();key(win,chart,'ArrowLeft');const tip=await waitFor(()=>{const t=$('.chart-scrub-tip');return t?.style.opacity==='1'&&text(t).includes('演示读数')?t:null});items.push(result('交互：ETF 图表键盘读取价格',!!tip,tip?text(tip):'缺少 ETF 图表读数'));key(win,chart,'Escape');const hidden=await waitFor(()=>tip?.style.opacity!=='1');items.push(result('交互：ETF Escape 关闭图表读数',!!hidden,'读数已隐藏'));addSurfaceAudit(win,items,'ETF详情交互后')}
    else items.push(result('交互：ETF 图表控件可操作',false,'缺少 ETF 图表或 YTD 按钮'));
  }
  async function missingStock(win,items){
    const d=win.document,$=s=>d.querySelector(s),notFound=$('.not-found'),fixed=$('.fixed'),share=$('#shareBtn');
    items.push(result('异常：未知股票进入明确未找到状态',!!notFound&&text(notFound).includes('没有找到这只股票')&&text(notFound).includes('ZZZZ'),notFound?text(notFound).slice(0,100):'缺少 not-found'));
    items.push(result('异常：未知股票没有行情替代值',text($('#topPrice'))==='—'&&text($('#topSymbol')).includes('ZZZZ'),`symbol=${text($('#topSymbol'))} · price=${text($('#topPrice'))}`));
    items.push(result('异常：未知股票隐藏固定操作与分享',isHidden(win,fixed)&&isHidden(win,share),`fixedHidden=${isHidden(win,fixed)} · shareHidden=${isHidden(win,share)}`));
    items.push(result('异常：未知股票不生成图表/K线/详情导航',!$('#chart')&&!$('.chart-view-toggle')&&!$('.detail-nav'),'未发现残留增强层'));
    addSurfaceAudit(win,items,'未知股票');
  }
  async function missingFund(win,items){
    const d=win.document,$=s=>d.querySelector(s),notFound=$('.not-found'),fixed=$('.fixed');
    items.push(result('异常：未知 ETF 进入明确未找到状态',!!notFound&&text(notFound).includes('没有找到这个 ETF / 基金')&&text(notFound).includes('FAKE'),notFound?text(notFound).slice(0,100):'缺少 not-found'));
    items.push(result('异常：未知 ETF 不使用 SPY 替代',text(notFound).includes('不会用 SPY')&&!$('#fundChart'),notFound?text(notFound).slice(0,120):'缺少 not-found'));
    items.push(result('异常：未知 ETF 隐藏固定操作栏',isHidden(win,fixed),`fixedHidden=${isHidden(win,fixed)}`));
    items.push(result('异常：未知 ETF 不生成图表/详情导航',!$('#fundChart')&&!$('.detail-nav'),'未发现残留增强层'));
    addSurfaceAudit(win,items,'未知ETF');
  }
  async function recoverySlow(win,items){
    const health=()=>win.FinanceResilienceHealth?.snapshot?.()||null;
    const appeared=await waitFor(()=>{const h=health();return h?.qaFault==='slow-ready'&&h.recoveryShows>=1?h:null},{timeout:1800});
    items.push(result('异常：慢加载恢复条至少出现一次',!!appeared,appeared?`shows=${appeared.recoveryShows} · visible=${appeared.recoveryVisible}`:'未记录 slow-ready recovery'));
    const recovered=await waitFor(()=>{const h=health();return h?.ready&&h.coreReady&&h.dataAvailable&&h.busy==='false'&&h.appReady&&!h.recoveryVisible&&h.recoveryRemovals>=1?h:null},{timeout:3500});
    items.push(result('异常：慢加载随后自动恢复 ready',!!recovered,recovered?`removed=${recovered.recoveryRemovals} · reason=${recovered.lastReconcileReason}`:'未在 3.5 秒内恢复完成态'));
    win.dispatchEvent(new win.CustomEvent('finance:resume',{detail:{reasons:['qa-recovery-check']}}));
    const resumed=await waitFor(()=>{const h=health();return h?.lastReconcileReason==='finance:resume'&&h.ready&&h.busy==='false'&&!h.recoveryVisible?h:null},{timeout:1300});
    items.push(result('异常：恢复后再次 resume 不回退',!!resumed,resumed?'ready 状态保持稳定':'finance:resume 后状态发生回退'));
    addSurfaceAudit(win,items,'慢加载恢复后');
  }
  async function recoveryMissing(win,items){
    const d=win.document,$=s=>d.querySelector(s),health=()=>win.FinanceResilienceHealth?.snapshot?.()||null;
    const missing=await waitFor(()=>{const h=health();return h?.qaFault==='data-missing'&&!h.dataAvailable&&!h.ready&&h.busy==='true'&&!h.appReady&&h.recoveryVisible&&h.lastRecoveryReason==='data-missing'?h:null},{timeout:1800});
    items.push(result('异常：数据源缺失保持 busy + recovery',!!missing,missing?`shows=${missing.recoveryShows} · reason=${missing.lastRecoveryReason}`:'数据缺失恢复态未建立'));
    const titleBefore=text($('.finance-recovery b'));items.push(result('异常：数据缺失恢复文案正确',titleBefore.includes('行情模块暂时没有加载完成'),titleBefore||'缺少恢复标题'));
    win.dispatchEvent(new win.CustomEvent('finance:resume',{detail:{reasons:['qa-data-missing-check']}}));
    const stable=await waitFor(()=>{const h=health();return h?.lastReconcileReason==='finance:resume'&&!h.ready&&!h.dataAvailable&&h.busy==='true'&&h.recoveryVisible&&h.lastRecoveryReason==='data-missing'?h:null},{timeout:1300});
    const titleAfter=text($('.finance-recovery b'));
    items.push(result('异常：数据缺失 resume 后状态不漂移',!!stable,stable?`reason=${stable.lastRecoveryReason} · busy=${stable.busy}`:'resume 后未保持 data-missing'));
    items.push(result('异常：数据缺失不会误显示网络已恢复',titleAfter.includes('行情模块暂时没有加载完成')&&!titleAfter.includes('网络已恢复'),titleAfter||'缺少恢复标题'));
    addSurfaceAudit(win,items,'数据缺失恢复态');
  }
  async function run(win,type,{signal=null}={}){
    const previousSignal=activeSignal;activeSignal=signal;
    const local=snapshot(win.localStorage),session=snapshot(win.sessionStorage),hash=win.location.hash,items=[],runtimeErrors=[];
    const onError=e=>runtimeErrors.push(e?.message||e?.error?.message||'window error');
    const onReject=e=>runtimeErrors.push(e?.reason?.message||String(e?.reason||'unhandledrejection'));
    win.addEventListener('error',onError);win.addEventListener('unhandledrejection',onReject);
    try{
      checkAbort();
      if(type==='home')await home(win,items);else if(type==='stock')await stock(win,items);else if(type==='fund')await fund(win,items);else if(type==='stock-missing')await missingStock(win,items);else if(type==='fund-missing')await missingFund(win,items);else if(type==='recovery-slow')await recoverySlow(win,items);else if(type==='recovery-missing')await recoveryMissing(win,items);else items.push(result('交互验收页面类型',false,`未知页面类型 ${type}`))
    }catch(e){if(e?.name!=='AbortError')items.push(result('交互验收执行完成',false,e?.message||String(e)))}
    finally{
      restore(win.localStorage,local);restore(win.sessionStorage,session);try{if(win.location.hash!==hash)win.history.replaceState(null,'',`${win.location.pathname}${win.location.search}${hash}`)}catch(e){}
      await delay(180);restore(win.localStorage,local);restore(win.sessionStorage,session);
      const localOk=sameSnapshot(snapshot(win.localStorage),local),sessionOk=sameSnapshot(snapshot(win.sessionStorage),session);items.push(result('QA 隔离：本机与会话状态已恢复',localOk&&sessionOk,`local=${localOk?'一致':'不一致'} · session=${sessionOk?'一致':'不一致'}`));
      if(signal?.aborted)items.push(result('QA 取消：超时后已停止后续交互',true,'AbortController 已中止等待链并完成清理'));
      win.removeEventListener('error',onError);win.removeEventListener('unhandledrejection',onReject);
      const unique=[...new Set(runtimeErrors.filter(Boolean))];items.push(result('交互期间无运行时异常',unique.length===0,unique.length?unique.slice(0,6).join('；'):'未捕获 error / unhandledrejection'));
      activeSignal=previousSignal;
    }
    return items;
  }
  window.FinanceQaInteractions={run};
})();
