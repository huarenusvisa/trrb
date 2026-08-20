(function(){
  if(window.__financeAcceptanceLoaded)return;window.__financeAcceptanceLoaded=true;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const params=new URLSearchParams(location.search),embedded=params.get('qaEmbed')==='1'&&window.parent!==window;
  const state={runs:0,last:null};
  function rendered(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect(),hiddenAncestor=el.closest('[hidden],[aria-hidden="true"]');return !hiddenAncestor&&s.display!=='none'&&s.visibility!=='hidden'&&s.pointerEvents!=='none'&&r.width>0&&r.height>0}
  function visible(el){if(!rendered(el))return false;const r=el.getBoundingClientRect();return r.bottom>0&&r.right>0&&r.top<window.innerHeight&&r.left<window.innerWidth}
  function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
  function accessibleName(el){
    const aria=(el.getAttribute('aria-label')||'').trim();if(aria)return aria;
    const labelledby=(el.getAttribute('aria-labelledby')||'').trim();if(labelledby){const label=labelledby.split(/\s+/).map(id=>text(document.getElementById(id))).filter(Boolean).join(' ');if(label)return label}
    const own=text(el);if(own)return own;
    const title=(el.getAttribute('title')||'').trim();if(title)return title;
    const placeholder=(el.getAttribute('placeholder')||'').trim();if(placeholder)return placeholder;
    return '';
  }
  function result(name,fn,severity='fail'){
    try{const value=fn();if(value===true)return {name,status:'pass',detail:'通过'};if(value&&typeof value==='object'&&'ok'in value)return {name,status:value.ok?'pass':severity,detail:value.detail||String(value.ok)};return {name,status:value?'pass':severity,detail:value?'通过':'未通过'}}catch(e){return {name,status:severity,detail:e?.message||String(e)}}
  }
  function duplicateIds(){const seen=new Map(),dups=[];$$('[id]').forEach(el=>{const id=el.id;if(!id)return;if(seen.has(id))dups.push(id);else seen.set(id,el)});return [...new Set(dups)]}
  function badInteractive(viewportOnly=false){const re=/(Trade|交易|开户|下单|申购|购买|KYC)/i,scope=viewportOnly?visible:rendered;return $$('a,button').filter(el=>scope(el)&&!el.disabled&&re.test(text(el))).map(text)}
  function targetAudit(viewportOnly=false){
    const limit=window.innerWidth<=620?36:32,scope=viewportOnly?visible:rendered;
    const weak=$$('a,button,input').filter(el=>!el.disabled&&!el.classList.contains('finance-skip-link')&&scope(el)).filter(el=>{const r=el.getBoundingClientRect();return r.width<limit||r.height<limit}).slice(0,16).map(el=>`${el.tagName.toLowerCase()}:${text(el).slice(0,18)||el.getAttribute('aria-label')||el.id||'未命名'} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
    return {limit,weak};
  }
  function unnamedInteractive(){return $$('a,button,input,[tabindex="0"]').filter(el=>rendered(el)&&!el.disabled&&!el.classList.contains('finance-skip-link')).filter(el=>!accessibleName(el)).slice(0,16).map(el=>`${el.tagName.toLowerCase()}#${el.id||'-'}.${el.className&&typeof el.className==='string'?el.className.split(/\s+/).filter(Boolean).slice(0,2).join('.'):''}`)}
  function fixedClearance(){
    const panel=$('.bottom')||$('.fixed'),shell=$('.app')||$('.stock-app');if(!panel||!shell||!rendered(panel))return {ok:true,detail:'当前页面无可见固定底栏'};
    const panelRect=panel.getBoundingClientRect(),shellStyle=getComputedStyle(shell),panelStyle=getComputedStyle(panel),paddingBottom=parseFloat(shellStyle.paddingBottom)||0,bottom=Math.max(0,parseFloat(panelStyle.bottom)||0),need=panelRect.height+bottom,reserve=paddingBottom-need;
    return {ok:reserve>=0,detail:`正文底部预留 ${Math.round(paddingBottom)}px · 固定层+bottom ${Math.round(need)}px · 剩余 ${Math.round(reserve)}px`}
  }
  function surfaceAudit(){const overflow=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)-document.documentElement.clientWidth;return {overflow:Math.max(0,Math.round(overflow)),forbidden:badInteractive(false),targets:targetAudit(false),unnamed:unnamedInteractive(),fixedClearance:fixedClearance()}}
  function commonChecks(){
    const dups=duplicateIds(),surface=surfaceAudit(),viewportTargets=targetAudit(true);
    return [
      result('数据适配层已加载',()=>!!window.FinanceData),
      result('页面主内容存在',()=>!!$('main')),
      result('无重复 ID',()=>({ok:dups.length===0,detail:dups.length?`重复：${dups.join(', ')}`:'0 个重复 ID'})),
      result('当前视口无横向溢出',()=>({ok:surface.overflow<=3,detail:`scrollWidth 差值 ${surface.overflow}px`})),
      result('固定底栏不会覆盖正文结尾',()=>surface.fixedClearance),
      result('当前渲染页面无交易/开户交互入口',()=>({ok:surface.forbidden.length===0,detail:surface.forbidden.length?surface.forbidden.join('；'):'未发现 Trade/交易/开户/下单/申购/购买/KYC 入口'})),
      result('可操作控件均有可访问名称',()=>({ok:surface.unnamed.length===0,detail:surface.unnamed.length?`缺少名称：${surface.unnamed.join('；')}`:'当前渲染页面控件名称完整'})),
      result('运行时生命周期已加载',()=>({ok:!!window.FinanceRuntimeHealth,detail:window.FinanceRuntimeHealth?'FinanceRuntimeHealth 可用':'等待 runtime-lifecycle.js'}),'warn'),
      result('首屏触控目标尺寸扫描',()=>({ok:viewportTargets.weak.length===0,detail:viewportTargets.weak.length?`小于${viewportTargets.limit}px：${viewportTargets.weak.join('；')}`:`首屏未发现小于${viewportTargets.limit}px的可操作目标`}),'warn'),
      result('当前页面全长触控目标扫描',()=>({ok:surface.targets.weak.length===0,detail:surface.targets.weak.length?`小于${surface.targets.limit}px：${surface.targets.weak.join('；')}`:`当前渲染页面未发现小于${surface.targets.limit}px的可操作目标`}),'warn')
    ]
  }
  function homeChecks(){
    const nav=$$('.bottom button'),pages=$$('.page'),active=$$('.page.active'),input=$('#searchInput'),box=$('#searchResults'),sort=$('.watch-column-head'),fundCats=$$('.fund-cat');
    return [
      result('一级导航固定四栏',()=>({ok:nav.length===4,detail:`${nav.length} 个导航项`})),
      result('仅一个一级页面处于 active',()=>({ok:pages.length===4&&active.length===1,detail:`页面 ${pages.length} / active ${active.length}`})),
      result('搜索 Combobox 语义完整',()=>({ok:!!input&&input.getAttribute('role')==='combobox'&&input.getAttribute('aria-controls')==='searchResults'&&box?.getAttribute('role')==='listbox',detail:input?`expanded=${input.getAttribute('aria-expanded')}`:'缺少搜索框'})),
      result('自选排序增强已装载',()=>({ok:!!sort&&$$('button[data-sort-key]',sort).length===3,detail:sort?'股票/最新价/涨跌幅排序控件存在':'缺少排序列头'})),
      result('ETF 主题筛选为真实按钮',()=>({ok:fundCats.length===4&&fundCats.every(x=>x.tagName==='BUTTON'&&x.hasAttribute('aria-pressed')),detail:`${fundCats.length} 个主题按钮`})),
      result('自选管理入口存在',()=>!!$('#watchManageBtn')),
      result('首页增强资源显式依赖',()=>({ok:!!$('link[href$="reference-features.css"]')&&!!$('script[src$="reference-features.js"]'),detail:'reference-features CSS/JS'}))
    ]
  }
  function stockChecks(){
    const notFound=$('.not-found');if(notFound)return [result('未知股票安全进入未找到状态',()=>true)];
    const ranges=$$('.range button[data-range]'),views=$$('.chart-view-toggle button'),kline=$$('.kline-granularity button'),advanced=$('#advancedChartBtn'),nav=$('.detail-nav');
    return [
      result('个股详情已渲染',()=>text($('#price'))!=='—'&&!!$('#chart svg')),
      result('走势图区间完整',()=>({ok:ranges.length===7,detail:`${ranges.length} 个区间`})),
      result('走势 / K线模式存在',()=>({ok:views.length===2,detail:`${views.length} 个图表模式`})),
      result('日K / 周K / 月K存在',()=>({ok:kline.length===3,detail:`${kline.length} 个K线周期`})),
      result('旧高级图表假入口已隐藏',()=>({ok:!!advanced&&advanced.hidden,detail:advanced?`hidden=${advanced.hidden}`:'按钮不存在'})),
      result('详情分区导航已生成',()=>({ok:!!nav&&$$('a',nav).length>=8,detail:nav?`${$$('a',nav).length} 个分区`:'缺少 detail-nav'})),
      result('详情返回上下文层可用',()=>!!window.FinanceNavigationMemory),
      result('个股固定操作仅研究功能',()=>({ok:$$('.fixed button').length===2&&surfaceAudit().forbidden.length===0,detail:$$('.fixed button').map(text).join(' / ')}))
    ]
  }
  function fundChecks(){
    const notFound=$('.not-found');if(notFound)return [result('未知 ETF 安全进入未找到状态',()=>true)];
    const ranges=$$('.range button[data-range]'),nav=$('.detail-nav');
    return [
      result('ETF 详情已渲染',()=>text($('#fundPrice'))!=='—'&&!!$('#fundChart svg')),
      result('ETF 图表区间完整',()=>({ok:ranges.length===6,detail:`${ranges.length} 个区间`})),
      result('ETF 详情分区导航已生成',()=>({ok:!!nav&&$$('a',nav).length===5,detail:nav?`${$$('a',nav).length} 个分区`:'缺少 detail-nav'})),
      result('ETF 返回上下文层可用',()=>!!window.FinanceNavigationMemory),
      result('ETF 固定操作无购买/申购',()=>({ok:$$('.fixed button').length===2&&surfaceAudit().forbidden.length===0,detail:$$('.fixed button').map(text).join(' / ')})),
      result('ETF 未加载股票K线增强',()=>({ok:!$('script[src$="reference-features.js"]'),detail:$('script[src$="reference-features.js"]')?'发现不必要的股票增强脚本':'按需加载正常'}),'warn')
    ]
  }
  function pageType(){if(/\/stock\.html$/i.test(location.pathname)||$('#price'))return 'stock';if(/\/fund\.html$/i.test(location.pathname)||$('#fundPrice'))return 'fund';return 'home'}
  function buildReport(){const type=pageType(),items=[...commonChecks(),...(type==='home'?homeChecks():type==='stock'?stockChecks():fundChecks())];const counts=items.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});return {type,viewport:`${window.innerWidth}×${window.innerHeight}`,url:location.href,at:new Date().toISOString(),items,counts,runtime:window.FinanceRuntimeHealth?.snapshot?.()||null}}
  function ensureStyle(){if($('#financeQaStyle'))return;const s=document.createElement('style');s.id='financeQaStyle';s.textContent='.finance-qa{position:fixed;z-index:9999;right:max(10px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));width:min(420px,calc(100vw - 20px));max-height:min(78vh,680px);overflow:auto;border:1px solid #dfe5e1;border-radius:18px;background:rgba(255,255,255,.97);box-shadow:0 22px 70px rgba(0,0,0,.18);padding:14px;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18201b;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}.finance-qa *{box-sizing:border-box}.finance-qa-head{display:flex;align-items:center;gap:8px;position:sticky;top:-14px;background:rgba(255,255,255,.97);padding:12px 0 10px;z-index:2}.finance-qa-head b{font-size:14px}.finance-qa-head small{color:#68716c;margin-right:auto}.finance-qa button{border:0;border-radius:999px;background:#eef3ef;color:#263029;min-height:32px;padding:5px 10px;font-weight:700}.finance-qa-summary{padding:9px 10px;border-radius:12px;background:#f5f7f6;margin-bottom:8px}.finance-qa-row{display:grid;grid-template-columns:18px 1fr;gap:7px;padding:8px 3px;border-bottom:1px solid #eef1ef}.finance-qa-row:last-child{border:0}.finance-qa-row i{font-style:normal;font-weight:900}.finance-qa-row.pass i{color:#008a05}.finance-qa-row.fail i{color:#d6321d}.finance-qa-row.warn i{color:#9a6a00}.finance-qa-row b{display:block;font-size:12px}.finance-qa-row small{display:block;color:#747d77;margin-top:2px;overflow-wrap:anywhere}@media(max-width:430px){.finance-qa{top:auto;bottom:max(8px,env(safe-area-inset-bottom));max-height:52vh;border-radius:17px}.finance-qa-head{top:-14px}}';document.head.appendChild(s)}
  function render(report){if(embedded)return;ensureStyle();let panel=$('#financeQaPanel');if(!panel){panel=document.createElement('aside');panel.id='financeQaPanel';panel.className='finance-qa';panel.setAttribute('aria-label','唐人财经验收诊断');document.body.appendChild(panel)}const c=report.counts;panel.innerHTML=`<div class="finance-qa-head"><b>Finance QA</b><small>${report.type} · ${report.viewport}</small><button type="button" data-qa-run>重跑</button><button type="button" data-qa-copy>复制</button><button type="button" data-qa-close aria-label="关闭诊断">×</button></div><div class="finance-qa-summary">PASS ${c.pass||0}　FAIL ${c.fail||0}　WARN ${c.warn||0}</div>${report.items.map(x=>`<div class="finance-qa-row ${x.status}"><i>${x.status==='pass'?'✓':x.status==='warn'?'!':'×'}</i><div><b>${x.name}</b><small>${x.detail}</small></div></div>`).join('')}`;panel.querySelector('[data-qa-run]').onclick=run;panel.querySelector('[data-qa-close]').onclick=()=>panel.remove();panel.querySelector('[data-qa-copy]').onclick=async()=>{const payload=JSON.stringify(state.last,null,2);try{await navigator.clipboard.writeText(payload);panel.querySelector('[data-qa-copy]').textContent='已复制'}catch(e){console.info('[Finance QA]',payload);panel.querySelector('[data-qa-copy]').textContent='见控制台'}}}
  function publish(report){if(!embedded)return;try{window.parent.postMessage({source:'finance-qa',report},location.origin)}catch(e){}}
  function run(){state.runs++;state.last=buildReport();render(state.last);publish(state.last);console.info('[Finance QA]',state.last);return state.last}
  window.FinanceAcceptance={run,snapshot:()=>state.last,runs:()=>state.runs,auditTargets:()=>targetAudit(false),auditViewportTargets:()=>targetAudit(true),auditSurface:surfaceAudit};
  const start=()=>setTimeout(run,650);if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
  window.addEventListener('finance:resume',()=>setTimeout(()=>{if(embedded||$('#financeQaPanel'))run()},180));
})();
