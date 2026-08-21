(function(){
  const D=window.FinanceData;if(!D)return;
  const snap=D.getMarketSnapshot();
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const money=v=>typeof v==='number'?v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):v;
  const pct=v=>`${v>=0?'▲':'▼'} ${Math.abs(v).toFixed(2)}%`;const cls=v=>v>=0?'up':'down';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localGet=(k,f=null)=>{try{const v=localStorage.getItem(k);return v===null?f:v}catch(e){return f}};
  const localSet=(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}};
  const line=(points,positive=true)=>{const max=Math.max(...points),min=Math.min(...points),w=86,h=34;const p=points.map((v,i)=>`${(i/(points.length-1))*w},${h-3-((v-min)/(max-min||1))*(h-6)}`).join(' ');return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${p}" fill="none" stroke="${positive?'#00c805':'#ff4d2e'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`};

  function announce(text){if(window.__financeRestoringNavigation)return;let el=$('#financeAnnouncer');if(!el){el=document.createElement('div');el.id='financeAnnouncer';el.className='sr-only';el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');document.body.appendChild(el)}el.textContent='';requestAnimationFrame(()=>{if(!window.__financeRestoringNavigation)el.textContent=text})}
  function notify(text,undoFn=null){
    let t=$('#financeToast');if(!t){t=document.createElement('div');t.id='financeToast';t.className='finance-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t)}
    clearTimeout(notify.timer);t.replaceChildren();const msg=document.createElement('span');msg.textContent=text;t.appendChild(msg);t.classList.toggle('has-action',!!undoFn);
    const hide=()=>{t.classList.remove('show','has-action');setTimeout(()=>{if(!t.classList.contains('show'))t.replaceChildren()},190)};
    if(undoFn){const b=document.createElement('button');b.type='button';b.textContent='撤销';b.addEventListener('click',()=>{undoFn();hide()},{once:true});t.appendChild(b)}
    requestAnimationFrame(()=>t.classList.add('show'));notify.timer=setTimeout(hide,undoFn?4200:2400);
  }
  function renderDataStatus(){
    const meta=D.getMeta?D.getMeta():null;
    const el=$('#dataStatus'),label=$('#marketSessionLabel');if(!meta)return;
    let stamp='演示快照';try{stamp=new Intl.DateTimeFormat('zh-CN',{timeZone:'America/New_York',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(meta.updatedAt))+' ET'}catch(e){}
    if(el)el.innerHTML=`<span class="status-dot ${meta.realTime?'live':'demo'}" aria-hidden="true"></span><span><b>${esc(meta.source)}</b> · ${meta.realTime?'正式数据接口':'测试数据'} · ${stamp}</span>`;
    if(label)label.textContent=`${meta.session.label}（${meta.realTime?'接口状态':'时段估算'}）`;
  }
  function initConnectivity(){const banner=$('#offlineBanner');if(!banner)return;const sync=()=>{const offline=navigator.onLine===false;banner.hidden=!offline;if(offline)announce('当前设备离线，实时数据不可用')};sync();window.addEventListener('online',()=>{sync();announce('网络连接已恢复')});window.addEventListener('offline',sync)}
  function renderIndices(){const el=$('#indices');if(el)el.innerHTML=snap.indices.map(i=>`<div class="indexcard"><div class="indexcard-top"><b>${i.name}</b><span>${i.symbol}</span></div><strong class="${cls(i.change)}">${money(i.price)}</strong><small class="${cls(i.change)}">${pct(i.change)}</small><div class="index-spark">${line(D.spark(i.symbol),i.change>=0)}</div></div>`).join('')}
  function heatClass(v){const a=Math.abs(v);return `${v>=0?'pos':'neg'}${a>3?3:a>1?2:1}`}
  function renderHeat(){const el=$('#heat');if(el)el.innerHTML=snap.heatmap.map((x,i)=>`<a class="${i===0?'s5 ':i===4?'s4 ':''}${heatClass(x.change)}" href="stock.html?symbol=${x.symbol}" aria-label="${x.symbol} ${x.change>=0?'上涨':'下跌'} ${Math.abs(x.change).toFixed(2)}%">${x.symbol}<small class="${cls(x.change)}">${x.change>=0?'+':''}${x.change.toFixed(2)}%</small></a>`).join('')}
  function renderMovers(){const el=$('#movers');if(el)el.innerHTML=snap.movers.map(x=>`<a class="mover" href="stock.html?symbol=${x.symbol}"><span class="mover-id"><b>${x.symbol}</b><small>${x.name}</small></span><strong class="${cls(x.change)}">${pct(x.change)}</strong></a>`).join('')}
  function renderEarnings(list=snap.earnings){const el=$('#earnings');if(el)el.innerHTML=list.map(x=>`<div class="event"><div><b>${x.name}</b><small>${x.symbol} · ${x.when} <span class="${cls(x.change)}">${pct(x.change)}</span></small></div><div class="right"><b>${x.status}</b><small>${x.eps}</small></div></div>`).join('')}
  function renderMacro(){const el=$('#macroList');if(el)el.innerHTML=snap.macro.map(x=>`<div class="macro-row"><div><b>${x.name}</b><small>${x.time} · ${x.consensus}</small></div><span class="badge ${x.importance==='高'?'high':'mid'}">${x.importance}重要</span></div>`).join('')}
  function renderCrypto(){const el=$('#cryptoList');if(el)el.innerHTML=snap.crypto.map(x=>`<div class="crypto-row"><div><b>${x.name}</b><small>${x.symbol}</small></div><div style="text-align:right"><b>$${money(x.price)}</b><small class="${cls(x.change)}">${pct(x.change)}</small></div></div>`).join('')}
  function newsHtml(items=snap.news){return items.map(n=>{const body=`<div><b>${esc(n.title)}</b><small>${esc(n.source)} · ${esc(n.time)}</small></div><div class="thumb" aria-hidden="true">${esc(n.tag)}</div>`;return n.url?`<a class="news" href="${esc(n.url)}">${body}</a>`:`<article class="news">${body}</article>`}).join('')}
  function renderNews(){const el=$('#marketNews');if(el)el.innerHTML=newsHtml();if(D.getFinanceNews)D.getFinanceNews(12).then(items=>{if(el&&items.length){el.innerHTML=newsHtml(items);const status=el.closest('.section')?.querySelector('.section-head span');if(status)status.textContent='同步自唐人日报'}}).catch(()=>{})}

  let watchView=localGet('trfinance.watchView','list')||'list';let watchFilter='all';let watchManage=false;
  const validWatchFilters=['all','us','china','etf','hk','cn'];
  function watchStocks(){return D.getWatchlist().map(s=>D.getQuote(s)).filter(Boolean)}
  function watchFunds(){return D.getFundWatchlist().map(symbol=>{const f=D.getFund(symbol);return f?{...f,market:'ETF',spark:D.spark(f.symbol),type:'fund'}:null}).filter(Boolean)}
  function watchSecurities(){return (D.getSecurityWatchlist?.()||[]).map(ref=>{const q=D.getCachedQuote?.(ref);return q?{...q,storage:'security'}:{...ref,id:D.instrumentId?.(ref),name:ref.name||ref.symbol,market:ref.exchange||'证券',price:0,change:0,spark:D.spark(ref.symbol),type:ref.route||(/ETF|Fund/i.test(ref.assetType||'')?'fund':'stock'),storage:'security'}})}
  function watchRecords(filter='all'){const stocks=watchStocks().map(x=>({...x,type:'stock',storage:'legacy'})),funds=watchFunds().map(x=>({...x,storage:'legacy'})),dynamic=watchSecurities();const all=[...stocks,...funds,...dynamic].filter((item,index,list)=>list.findIndex(other=>(other.id||`${other.symbol}|${other.market}|${other.type}`)===(item.id||`${item.symbol}|${item.market}|${item.type}`))===index);if(filter==='etf')return all.filter(s=>s.type==='fund'||/ETF|Fund/i.test(s.assetType||''));if(filter==='us')return all.filter(s=>['NASDAQ','NYSE','NYSE ARCA','US'].includes(s.market)&&s.group!=='china');if(filter==='china')return all.filter(s=>s.group==='china'||s.symbol==='BABA');if(filter==='hk')return all.filter(s=>s.group==='hk');if(filter==='cn')return all.filter(s=>s.group==='cn');return all}
  function recordHref(s){return D.detailHref?D.detailHref(s):`${s.type==='fund'?'fund.html':'stock.html'}?symbol=${s.symbol}`}
  function watchMarkup(items){
    if(watchManage)return items.map(s=>`<div class="watch-manage-item"><a class="watch-manage-link" href="${recordHref(s)}"><div><div class="name">${esc(s.name)}</div><div class="ticker">${esc(s.symbol)} · ${esc(s.market)}</div></div><div class="watch-manage-price"><b>${s.currency&&s.currency!=='USD'?esc(s.currency)+' ': '$'}${money(s.price)}</b><small class="${cls(s.change)}">${s.change>=0?'+':''}${s.change.toFixed(2)}%</small></div></a><button class="watch-remove" type="button" data-symbol="${esc(s.symbol)}" data-type="${esc(s.type)}" data-store="${esc(s.storage||'legacy')}" data-refid="${encodeURIComponent(s.id||'')}" aria-label="从自选移除 ${esc(s.name)}">移除</button></div>`).join('');
    if(watchView==='heat')return `<div class="watch-heat">${items.map(s=>`<a class="watch-tile ${s.change>=0?'pos':'neg'}" href="${recordHref(s)}"><div><b>${s.symbol}</b><div class="ticker">${s.name}</div></div><div><strong>${s.change>=0?'+':''}${s.change.toFixed(2)}%</strong><div>$${money(s.price)}</div></div></a>`).join('')}</div>`;
    return items.map(s=>`<a class="watch" href="${recordHref(s)}"><div><div class="name">${s.name}</div><div class="ticker">${s.symbol} · ${s.market}</div></div>${line(s.spark,s.change>=0)}<div class="price">$${money(s.price)}</div><div class="change ${s.change>=0?'upbg':'downbg'}">${s.change>=0?'+':''}${s.change.toFixed(2)}%</div></a>`).join('')
  }
  function removeWatchRecord(type,symbol,store='legacy',refid=''){
    const beforeStocks=D.getWatchlist(),beforeFunds=D.getFundWatchlist();
    const beforeSecurities=D.getSecurityWatchlist?.()||[];
    if(store==='security')D.setSecurityWatchlist(beforeSecurities.filter(ref=>D.instrumentId(ref)!==refid));else if(type==='fund')D.setFundWatchlist(beforeFunds.filter(s=>s!==symbol));else D.setWatchlist(beforeStocks.filter(s=>s!==symbol));
    renderWatch();announce(`${symbol} 已移出自选`);
    notify(`${symbol} 已移出自选`,()=>{D.setWatchlist(beforeStocks);D.setFundWatchlist(beforeFunds);D.setSecurityWatchlist?.(beforeSecurities);renderWatch();announce(`${symbol} 已恢复到自选`)})
  }
  function renderWatch(){
    const el=$('#watchlist');if(!el)return;const items=watchRecords(watchFilter);if(!items.length)watchManage=false;
    const count=$('#watchCount');if(count)count.textContent=`${items.length} 项`;
    const manage=$('#watchManageBtn');if(manage){manage.textContent=watchManage?'完成':'管理';manage.setAttribute('aria-pressed',String(watchManage));manage.disabled=!items.length}
    const page=$('.page[data-page="watch"]');if(page)page.classList.toggle('watch-manage-active',watchManage);
    el.innerHTML=items.length?watchMarkup(items):`<div class="empty">${watchFilter==='all'?'还没有自选。搜索股票并加入自选后会显示在这里。':'这个分类暂时没有自选。'}</div>`;
    $$('.view-switch button').forEach(b=>{const on=b.dataset.view===watchView;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));b.disabled=watchManage});
    $$('.watch-remove',el).forEach(b=>b.addEventListener('click',()=>removeWatchRecord(b.dataset.type,b.dataset.symbol,b.dataset.store,decodeURIComponent(b.dataset.refid||''))))
  }
  function setWatchFilter(next){if(!validWatchFilters.includes(next))next='all';watchFilter=next;$$('.watch-filter').forEach(x=>{const on=x.dataset.filter===watchFilter;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});renderWatch();return watchFilter}

  let fundFilter='all';
  const fundFilterDefs={
    core:{label:'核心指数',match:f=>['核心指数','全市场'].includes(f.category)},
    tech:{label:'科技成长',match:f=>f.category==='科技成长'},
    gold:{label:'黄金',match:f=>f.category==='黄金'},
    semi:{label:'半导体',match:f=>f.category==='半导体'}
  };
  function fundRecords(){const def=fundFilterDefs[fundFilter];return def?snap.funds.filter(def.match):snap.funds}
  function renderFunds(){
    const el=$('#fundList');if(!el)return;const items=fundRecords();
    el.innerHTML=items.length?items.map(f=>`<a class="fund" href="fund.html?symbol=${f.symbol}"><div><b>${f.name}</b><small>${f.symbol} · ${f.category} · 费率 ${f.expense}</small></div><div>$${money(f.price)}</div><div class="ret ${cls(f.change)}">${f.change>=0?'+':''}${f.change.toFixed(2)}%</div></a>`).join(''):'<div class="empty">这个主题暂时没有 ETF 演示数据。</div>';
    $$('.fund-cat').forEach(b=>{const on=b.dataset.fundFilter===fundFilter;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
    const status=$('#fundFilterStatus');if(status)status.textContent=fundFilter==='all'?`全部 · ${items.length}只 · 演示数据`:`${fundFilterDefs[fundFilter].label} · ${items.length}只`;
  }
  function setFundFilter(next){if(next!=='all'&&!fundFilterDefs[next])next='all';fundFilter=next;renderFunds();return fundFilter}

  function setPage(target,{updateHash=true,scroll=true}={}){const valid=['watch','market','funds','profile'];if(!valid.includes(target))target='market';$$('.bottom button').forEach(b=>{const on=b.dataset.target===target;b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false')});$$('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===target));if(updateHash&&location.hash!==`#${target}`)history.pushState(null,'',`#${target}`);if(scroll)window.scrollTo({top:0,behavior:document.documentElement.classList.contains('reduce-motion')?'auto':'smooth'});if(target==='profile')renderProfileState();announce(`已切换到${target==='watch'?'自选':target==='market'?'行情':target==='funds'?'基金':'我的'}`);return target}
  function initNav(){$$('.bottom button').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.target)));window.addEventListener('popstate',()=>setPage(location.hash.slice(1),{updateHash:false,scroll:false}));setPage(location.hash.slice(1)||'market',{updateHash:false,scroll:false})}
  function setMarketPanel(button){if(!button)return null;$$('.market-tab').forEach(x=>{const on=x===button;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on));x.setAttribute('tabindex',on?'0':'-1')});$$('.market-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===button.dataset.panel));return button.dataset.panel}
  function setMarketPanelByKey(next){const target=$(`.market-tab[data-panel="${next}"]`)||$('.market-tab[data-panel="now"]');return setMarketPanel(target)||'now'}
  function initMarketTabs(){const tabs=$$('.market-tab');tabs.forEach((b,i)=>{b.addEventListener('click',()=>setMarketPanel(b));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let n=i;if(e.key==='ArrowRight')n=(i+1)%tabs.length;if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;tabs[n].focus();setMarketPanel(tabs[n])})})}
  function initWatchTabs(){$$('.watch-filter').forEach(b=>b.addEventListener('click',()=>setWatchFilter(b.dataset.filter)))}
  function initViews(){$$('.view-switch button').forEach(b=>b.addEventListener('click',()=>{if(watchManage)return;watchView=b.dataset.view;localSet('trfinance.watchView',watchView);renderWatch()}))}
  function initWatchManage(){const b=$('#watchManageBtn');if(!b)return;b.addEventListener('click',()=>{watchManage=!watchManage;if(watchManage&&watchView!=='list'){watchView='list';localSet('trfinance.watchView','list')}renderWatch();announce(watchManage?'已进入自选管理模式':'已退出自选管理模式')})}
  function initFundFilters(){$$('.fund-cat').forEach(b=>b.addEventListener('click',()=>{const next=fundFilter===b.dataset.fundFilter?'all':b.dataset.fundFilter;setFundFilter(next);const label=fundFilter==='all'?'全部 ETF':fundFilterDefs[fundFilter].label;announce(`ETF 榜单已切换到${label}`)}))}
  function initSearch(){const input=$('#searchInput'),box=$('#searchResults');if(!input||!box)return;let active=-1,requestId=0,timer=0;function close(){box.classList.remove('open');input.setAttribute('aria-expanded','false');active=-1}function select(i){const links=$$('.search-hit',box);links.forEach((a,n)=>a.classList.toggle('active',n===i));active=i;if(links[i])links[i].scrollIntoView({block:'nearest'})}function render(value,hits){box.innerHTML=hits.length?hits.map((x,i)=>`<a id="search-option-${i}" role="option" class="search-hit" href="${esc(x.detailHref||recordHref(x))}" data-search-index="${i}"><div><b>${esc(x.name)}</b><small>${esc(x.symbol)} · ${esc(x.exchange||x.market||x.category||x.type)}</small></div><span>${esc(x.currency||x.assetType||'证券')}</span></a>`).join(''):`<div class="search-empty" role="status">没有找到“${esc(value)}”</div>`;box.classList.add('open');input.setAttribute('aria-expanded','true');active=-1;$$('.search-hit',box).forEach((link,i)=>link.addEventListener('click',()=>D.setSelectedInstrument?.(hits[i])))}input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','searchResults');input.setAttribute('aria-expanded','false');input.addEventListener('input',()=>{const value=input.value.trim(),id=++requestId;clearTimeout(timer);if(!value){box.innerHTML='';close();return}box.innerHTML='<div class="search-empty" role="status">正在搜索全部证券市场…</div>';box.classList.add('open');input.setAttribute('aria-expanded','true');timer=setTimeout(async()=>{const hits=D.searchAsync?await D.searchAsync(value,{limit:30}):D.search(value);if(id===requestId)render(value,hits)},220)});input.addEventListener('keydown',e=>{const links=$$('.search-hit',box);if(e.key==='Escape'){close();return}if(!links.length)return;if(e.key==='ArrowDown'){e.preventDefault();select((active+1)%links.length)}else if(e.key==='ArrowUp'){e.preventDefault();select((active-1+links.length)%links.length)}else if(e.key==='Enter'&&active>=0){e.preventDefault();links[active].click()}});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))close()})}
  function initPrefs(){if(!$('#prefStyles')){const st=document.createElement('style');st.id='prefStyles';st.textContent='.compact .watch{padding:9px 0}.compact .watch .name{font-size:15px}.compact .news{padding:11px 0}.reduce-motion *{scroll-behavior:auto!important;animation:none!important;transition:none!important}';document.head.appendChild(st)}const compact=$('#compactToggle'),motion=$('#motionToggle');let prefs={};try{prefs=JSON.parse(localGet('trfinance.prefs','{}'))}catch(e){};function apply(){document.documentElement.classList.toggle('compact',!!prefs.compact);document.documentElement.classList.toggle('reduce-motion',prefs.motion===false);if(compact){compact.classList.toggle('on',!!prefs.compact);compact.setAttribute('aria-pressed',String(!!prefs.compact))}if(motion){motion.classList.toggle('on',prefs.motion!==false);motion.setAttribute('aria-pressed',String(prefs.motion!==false))}}apply();$$('.toggle').forEach(t=>t.addEventListener('click',()=>{t.classList.toggle('on');prefs[t.dataset.pref]=t.classList.contains('on');localSet('trfinance.prefs',JSON.stringify(prefs));apply();announce(`${t.closest('.service')?.querySelector('span')?.textContent||'偏好'}已${t.classList.contains('on')?'开启':'关闭'}`)}))}
  function renderProfileState(){
    const list=$('#historyList'),count=$('#historyCount'),alertList=$('#alertList');let h=[];try{h=JSON.parse(localGet('trfinance.history','[]'))}catch(e){}
    if(list){list.innerHTML=h.length?h.slice(0,8).map(x=>`<a class="service" style="text-decoration:none;color:inherit" href="${esc(D.detailHref?D.detailHref({...x,route:x.type}):`${x.type==='fund'?'fund.html':'stock.html'}?symbol=${x.symbol}`)}"><span><b>${esc(x.symbol)}</b> · ${esc(x.name)}</span><span aria-hidden="true">›</span></a>`).join(''):'<div class="empty">浏览股票或 ETF 后会显示在这里。</div>'}if(count)count.textContent=`${h.length} 条记录`;
    if(alertList){const legacy=(D.getAlerts?D.getAlerts():[]).map(x=>({...x,legacy:true})),rules=(D.getAlertRules?.()||[]).map(rule=>({...rule.instrument,ruleId:rule.id,threshold:rule.threshold})),alerts=[...legacy,...rules];alertList.innerHTML=alerts.length?alerts.map(x=>`<div class="service alert-row"><a href="${esc(D.detailHref?D.detailHref(x):`stock.html?symbol=${x.symbol}`)}"><b>${esc(x.symbol)}</b> · ${esc(x.name||x.symbol)}${x.threshold?` · 波动 ${esc(x.threshold)}%`:''}</a><button type="button" class="text-button alert-remove" data-symbol="${esc(x.symbol)}" data-ruleid="${encodeURIComponent(x.ruleId||'')}" data-legacy="${x.legacy?'1':'0'}">关闭</button></div>`).join(''):'<div class="empty">设置股票提醒后会显示在这里。</div>';$$('.alert-remove',alertList).forEach(b=>b.addEventListener('click',()=>{if(b.dataset.legacy==='1')D.setAlert(b.dataset.symbol,false);else{const rules=D.getAlertRules().filter(rule=>rule.id!==decodeURIComponent(b.dataset.ruleid||''));try{localStorage.setItem('trfinance.alertRules',JSON.stringify(rules))}catch(e){}}renderProfileState();announce(`${b.dataset.symbol} 提醒已关闭`)}))}
  }
  function initProfileActions(){const clearHistory=$('#clearHistoryBtn'),clearAlerts=$('#clearAlertsBtn'),clearAll=$('#clearLocalDataBtn');if(clearHistory)clearHistory.addEventListener('click',()=>{D.clearHistory();renderProfileState();announce('浏览记录已清除')});if(clearAlerts)clearAlerts.addEventListener('click',()=>{D.clearAlerts();renderProfileState();announce('价格提醒已全部关闭')});if(clearAll)clearAll.addEventListener('click',()=>{if(!confirm('清除当前设备上的唐人财经自选、浏览记录、提醒和显示偏好？'))return;D.clearLocalState();D.setWatchlist([]);D.setFundWatchlist([]);watchView='list';watchFilter='all';watchManage=false;fundFilter='all';renderWatch();renderFunds();renderProfileState();document.documentElement.classList.remove('compact','reduce-motion');announce('唐人财经本机数据已清除')})}

  const appRefreshHealth={watch:0,funds:0,profile:0,lastReason:''};
  window.FinanceAppState={
    refreshWatch:(reason='external')=>{appRefreshHealth.watch++;appRefreshHealth.lastReason=reason;renderWatch();return true},
    refreshFunds:(reason='external')=>{appRefreshHealth.funds++;appRefreshHealth.lastReason=reason;renderFunds();return true},
    refreshProfile:(reason='external')=>{appRefreshHealth.profile++;appRefreshHealth.lastReason=reason;renderProfileState();return true},
    setPage:(target,opts={})=>setPage(target,opts),
    setMarketPanel:next=>setMarketPanelByKey(next),
    setWatchFilter:next=>setWatchFilter(next),
    setFundFilter:next=>setFundFilter(next),
    snapshot:()=>({page:$('.page.active')?.dataset.page||'market',marketPanel:$('.market-tab.on')?.dataset.panel||'now',watchView,watchFilter,watchManage,fundFilter,refreshes:{watch:appRefreshHealth.watch,funds:appRefreshHealth.funds,profile:appRefreshHealth.profile},lastRefreshReason:appRefreshHealth.lastReason})
  };

  renderDataStatus();D.refreshMeta?.().then(()=>renderDataStatus()).catch(()=>{});initConnectivity();renderIndices();renderHeat();renderMovers();renderEarnings();renderMacro();renderCrypto();renderNews();renderWatch();renderFunds();renderProfileState();initNav();initMarketTabs();initWatchTabs();initViews();initWatchManage();initFundFilters();initSearch();initPrefs();initProfileActions();
  Promise.allSettled((D.getSecurityWatchlist?.()||[]).map(ref=>D.getQuoteAsync?.(ref))).then(()=>renderWatch());
})();
