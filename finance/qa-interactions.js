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
  function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
  function key(win,el,keyName){checkAbort();el.dispatchEvent(new win.KeyboardEvent('keydown',{key:keyName,bubbles:true,cancelable:true}))}
  async function waitFor(fn,{timeout=900,interval=24}={}){const start=Date.now();let value;while(Date.now()-start<timeout){checkAbort();try{value=fn();if(value)return value}catch(e){}await sleep(interval)}checkAbort();try{return fn()||null}catch(e){return null}}
  async function clickAndWait(el,fn,opts){checkAbort();if(!el)return null;el.click();return waitFor(fn,opts)}
  function addSurfaceAudit(win,items,label){
    checkAbort();const audit=win.FinanceAcceptance?.auditSurface?.();if(!audit){items.push(result(`交互：${label}页面审计`,false,'FinanceAcceptance.auditSurface 不可用','warn'));return}
    items.push(result(`交互：${label}无横向溢出`,audit.overflow<=3,`scrollWidth 差值 ${audit.overflow}px`));
    items.push(result(`交互：${label}固定底栏正文预留`,audit.fixedClearance?.ok!==false,audit.fixedClearance?.detail||'无固定底栏'));
    items.push(result(`交互：${label}无交易/开户入口`,audit.forbidden.length===0,audit.forbidden.length?audit.forbidden.join('；'):'未发现禁区入口'));
    items.push(result(`交互：${label}控件名称完整`,audit.unnamed.length===0,audit.unnamed.length?`缺少名称：${audit.unnamed.join('；')}`:'可操作控件均有可访问名称'));
    items.push(result(`交互：${label}全长触控目标`,audit.targets.weak.length===0,audit.targets.weak.length?`小于${audit.targets.limit}px：${audit.targets.weak.join('；')}`:`未发现小于${audit.targets.limit}px的可操作目标`,'warn'))
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
      await clickAndWait(navFunds,()=>$('.page[data-page="funds"].active'));
      const gold=$('.fund-cat[data-fund-filter="gold"]');if(gold){gold.click();const filtered=await waitFor(()=>{const links=$$('#fundList a.fund'),status=text($('#fundFilterStatus'));return gold.getAttribute('aria-pressed')==='true'&&links.length===1&&links[0].getAttribute('href')?.includes('GLD')&&status.includes('黄金')?{links,status}:null});items.push(result('交互：黄金主题真实筛选 ETF',!!filtered,filtered?`${filtered.status} · ${filtered.links.length} 条`:`${text($('#fundFilterStatus'))} · ${$$('#fundList a.fund').length} 条`));gold.click();await waitFor(()=>gold.getAttribute('aria-pressed')==='false')}
      else items.push(result('交互：ETF 主题筛选可操作',false,'缺少黄金主题按钮'));
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
    }else items.push(result('交互：个股图表模式控件可操作',false,'缺少走势/K线控件'));
  }
  async function fund(win,items){
    const d=win.document,$=s=>d.querySelector(s);const ytd=$('.range button[data-range="YTD"]'),chart=$('#fundChart');
    if(ytd&&chart){ytd.click();const redrawn=await waitFor(()=>ytd.classList.contains('on')&&!!$('#fundChart svg'));items.push(result('交互：ETF YTD 区间真实重绘',!!redrawn,`active=${ytd.classList.contains('on')}`));const fundA11y=await waitFor(()=>{const label=chart.getAttribute('aria-label')||'';return chart.getAttribute('role')==='group'&&label.includes('ETF')&&label.includes('YTD')&&label.includes('走势图')?label:null});items.push(result('交互：ETF 图表辅助语义同步',!!fundA11y,fundA11y||`role=${chart.getAttribute('role')} · label=${chart.getAttribute('aria-label')||''}`));chart.focus();key(win,chart,'ArrowLeft');const tip=await waitFor(()=>{const t=$('.chart-scrub-tip');return t?.style.opacity==='1'&&text(t).includes('演示读数')?t:null});items.push(result('交互：ETF 图表键盘读取价格',!!tip,tip?text(tip):'缺少 ETF 图表读数'));key(win,chart,'Escape');const hidden=await waitFor(()=>tip?.style.opacity!=='1');items.push(result('交互：ETF Escape 关闭图表读数',!!hidden,'读数已隐藏'))}
    else items.push(result('交互：ETF 图表控件可操作',false,'缺少 ETF 图表或 YTD 按钮'));
  }
  async function run(win,type,{signal=null}={}){
    const previousSignal=activeSignal;activeSignal=signal;
    const local=snapshot(win.localStorage),session=snapshot(win.sessionStorage),hash=win.location.hash,items=[],runtimeErrors=[];
    const onError=e=>runtimeErrors.push(e?.message||e?.error?.message||'window error');
    const onReject=e=>runtimeErrors.push(e?.reason?.message||String(e?.reason||'unhandledrejection'));
    win.addEventListener('error',onError);win.addEventListener('unhandledrejection',onReject);
    try{checkAbort();if(type==='home')await home(win,items);else if(type==='stock')await stock(win,items);else if(type==='fund')await fund(win,items);else items.push(result('交互验收页面类型',false,`未知页面类型 ${type}`))}
    catch(e){if(e?.name!=='AbortError')items.push(result('交互验收执行完成',false,e?.message||String(e)))}
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