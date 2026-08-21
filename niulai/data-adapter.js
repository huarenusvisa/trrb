(function(){
  const demoAsOf = '2026-08-19T16:00:00-04:00';
  const demo = {
    updatedAt: demoAsOf,
    indices: [
      {symbol:'DJI',name:'道琼斯',price:53463.05,change:0.22},
      {symbol:'IXIC',name:'纳斯达克',price:26331.09,change:0.16},
      {symbol:'SPX',name:'标普500',price:7707.98,change:0.21}
    ],
    stocks: {
      AAPL:{symbol:'AAPL',name:'Apple',market:'NASDAQ',price:316.28,change:2.22,after:-0.20,open:310.42,high:318.10,low:309.88,prev:309.41,marketCap:'4.72T',pe:'34.8',volume:'61.3M',range52:'189–318',sector:'科技',description:'Apple 设计、制造并销售智能手机、个人电脑、平板设备、可穿戴设备及相关服务。',watch:true},
      NVDA:{symbol:'NVDA',name:'NVIDIA',market:'NASDAQ',price:182.14,change:-0.74,after:0.18,open:183.80,high:185.22,low:179.96,prev:183.50,marketCap:'4.44T',pe:'49.2',volume:'208.1M',range52:'86–196',sector:'半导体',description:'NVIDIA 提供加速计算平台、GPU、数据中心与人工智能基础设施。',watch:true},
      TSLA:{symbol:'TSLA',name:'Tesla',market:'NASDAQ',price:348.63,change:1.54,after:-0.12,open:343.10,high:352.88,low:341.74,prev:343.34,marketCap:'1.13T',pe:'102.6',volume:'92.7M',range52:'212–488',sector:'汽车',description:'Tesla 设计、生产和销售电动汽车、储能系统及相关能源产品。',watch:true},
      MSFT:{symbol:'MSFT',name:'Microsoft',market:'NASDAQ',price:531.42,change:0.56,after:0.08,open:527.10,high:534.00,low:526.33,prev:528.46,marketCap:'3.95T',pe:'37.1',volume:'21.8M',range52:'344–555',sector:'软件',description:'Microsoft 提供软件、云计算、生产力工具、游戏与人工智能服务。',watch:true},
      AMZN:{symbol:'AMZN',name:'Amazon',market:'NASDAQ',price:246.18,change:2.57,after:0.11,open:240.01,high:247.30,low:239.42,prev:240.01,marketCap:'2.62T',pe:'41.6',volume:'49.2M',range52:'151–250',sector:'消费',description:'Amazon 经营电商、云计算、广告、物流和数字内容业务。',watch:false},
      META:{symbol:'META',name:'Meta Platforms',market:'NASDAQ',price:801.11,change:0.67,after:-0.05,open:795.02,high:808.20,low:790.41,prev:795.78,marketCap:'2.02T',pe:'29.8',volume:'16.7M',range52:'442–812',sector:'互联网',description:'Meta 运营 Facebook、Instagram、WhatsApp 等社交平台并发展人工智能和虚拟现实业务。',watch:false},
      GOOGL:{symbol:'GOOGL',name:'Alphabet',market:'NASDAQ',price:231.09,change:-0.03,after:0.04,open:231.42,high:233.50,low:228.16,prev:231.16,marketCap:'2.81T',pe:'28.2',volume:'31.1M',range52:'142–242',sector:'互联网',description:'Alphabet 是 Google 母公司，业务覆盖搜索、广告、云计算、YouTube 与人工智能。',watch:false},
      BABA:{symbol:'BABA',name:'阿里巴巴',market:'NYSE',price:161.28,change:1.86,after:0.03,open:158.70,high:162.52,low:157.83,prev:158.33,marketCap:'385B',pe:'24.1',volume:'18.3M',range52:'73–176',sector:'中概互联网',description:'阿里巴巴经营电子商务、云计算、物流和数字媒体业务。',watch:true},
      AVGO:{symbol:'AVGO',name:'Broadcom',market:'NASDAQ',price:322.40,change:-4.21,after:0.12,open:335.10,high:337.20,low:319.80,prev:336.57,marketCap:'1.52T',pe:'47.0',volume:'35.1M',range52:'134–374',sector:'半导体',description:'Broadcom 提供半导体、网络基础设施与企业软件产品。',watch:false},
      AMD:{symbol:'AMD',name:'AMD',market:'NASDAQ',price:171.40,change:-3.71,after:0.09,open:177.90,high:179.20,low:169.80,prev:178.00,marketCap:'278B',pe:'46.3',volume:'62.4M',range52:'76–227',sector:'半导体',description:'AMD 提供 CPU、GPU、数据中心与嵌入式计算产品。',watch:false},
      MU:{symbol:'MU',name:'Micron',market:'NASDAQ',price:154.80,change:-0.27,after:0.06,open:155.20,high:157.10,low:152.90,prev:155.22,marketCap:'174B',pe:'22.8',volume:'22.2M',range52:'61–170',sector:'存储芯片',description:'Micron 提供 DRAM、NAND 与存储解决方案。',watch:false},
      MRNA:{symbol:'MRNA',name:'Moderna',market:'NASDAQ',price:42.36,change:19.37,after:-0.31,open:36.70,high:44.10,low:36.20,prev:35.49,marketCap:'16B',pe:'—',volume:'31.8M',range52:'22–76',sector:'生物医药',description:'Moderna 开发基于 mRNA 平台的疫苗与治疗产品。',watch:false},
      MSTR:{symbol:'MSTR',name:'Strategy',market:'NASDAQ',price:483.20,change:17.37,after:-0.40,open:430.50,high:493.70,low:425.10,prev:411.70,marketCap:'139B',pe:'—',volume:'27.4M',range52:'102–543',sector:'软件/数字资产',description:'Strategy 提供企业分析软件，并持有大量比特币资产。',watch:false},
      CRM:{symbol:'CRM',name:'Salesforce',market:'NYSE',price:271.82,change:0.91,after:0.15,open:269.60,high:273.10,low:268.30,prev:269.37,marketCap:'258B',pe:'38.5',volume:'8.7M',range52:'226–369',sector:'软件',description:'Salesforce 提供客户关系管理、云软件与人工智能企业服务。',watch:false}
    },
    funds: [
      {symbol:'SPY',name:'SPDR S&P 500 ETF',category:'核心指数',price:770.23,change:0.22,expense:'0.09%',aum:'$680B',risk:'中等',holdings:['NVDA','AAPL','MSFT']},
      {symbol:'QQQ',name:'Invesco QQQ',category:'科技成长',price:668.41,change:0.18,expense:'0.20%',aum:'$410B',risk:'中高',holdings:['NVDA','MSFT','AAPL']},
      {symbol:'GLD',name:'SPDR Gold Shares',category:'黄金',price:307.82,change:0.63,expense:'0.40%',aum:'$105B',risk:'中等',holdings:['Gold']},
      {symbol:'VTI',name:'Vanguard Total Stock Market ETF',category:'全市场',price:334.18,change:0.19,expense:'0.03%',aum:'$560B',risk:'中等',holdings:['AAPL','NVDA','MSFT']},
      {symbol:'SOXX',name:'iShares Semiconductor ETF',category:'半导体',price:332.44,change:-0.41,expense:'0.35%',aum:'$18B',risk:'高',holdings:['NVDA','AVGO','AMD']},
      {symbol:'KWEB',name:'KraneShares CSI China Internet ETF',category:'中概互联网',price:44.81,change:1.12,expense:'0.70%',aum:'$8B',risk:'高',holdings:['BABA','TCEHY','PDD']}
    ],
    heatmap:[
      {symbol:'NVDA',change:-0.74,size:5},{symbol:'AAPL',change:2.02,size:4},{symbol:'GOOGL',change:-0.03,size:3},{symbol:'MSFT',change:0.56,size:3},{symbol:'AVGO',change:-4.21,size:4},{symbol:'META',change:0.67,size:3},{symbol:'AMD',change:-1.62,size:2},{symbol:'AMZN',change:2.57,size:3},{symbol:'MU',change:-0.27,size:2}
    ],
    movers:[
      {symbol:'MRNA',name:'Moderna',change:19.37},{symbol:'MSTR',name:'Strategy',change:17.37},{symbol:'AMZN',name:'Amazon',change:2.57},{symbol:'AVGO',name:'Broadcom',change:-4.21},{symbol:'AMD',name:'AMD',change:-3.71}
    ],
    earnings:[
      {symbol:'TGT',name:'Target',when:'今日盘前',status:'超预期',eps:'$3.04',change:-2.14},
      {symbol:'VIK',name:'Viking Holdings',when:'今日盘前',status:'超预期',eps:'$1.31',change:7.38},
      {symbol:'ZTO',name:'ZTO Express',when:'今日盘后',status:'已发布',eps:'$0.56',change:-6.10},
      {symbol:'NVDA',name:'NVIDIA',when:'明日盘后',status:'即将公布',eps:'预期 $1.18',change:-0.74},
      {symbol:'CRM',name:'Salesforce',when:'明日盘后',status:'即将公布',eps:'预期 $2.78',change:0.91}
    ],
    macro:[
      {time:'周四 08:30',name:'美国初请失业金人数',importance:'高',consensus:'预期 228K'},
      {time:'周四 10:00',name:'美国成屋销售',importance:'中',consensus:'预期 4.05M'},
      {time:'周五 10:00',name:'美联储主席讲话',importance:'高',consensus:'关注利率路径'},
      {time:'下周二 08:30',name:'美国核心 PCE',importance:'高',consensus:'关注通胀趋势'}
    ],
    crypto:[
      {symbol:'BTC',name:'Bitcoin',price:118420,change:1.82},
      {symbol:'ETH',name:'Ethereum',price:4621,change:2.34},
      {symbol:'SOL',name:'Solana',price:212.8,change:-0.88}
    ],
    news:[
      {tag:'MARKET',title:'美股三大指数走高，科技股与医药股成为资金焦点',source:'唐人财经',time:'12分钟前'},
      {tag:'AI',title:'芯片板块分化，投资者重新评估 AI 资本开支与估值',source:'唐人财经',time:'31分钟前'},
      {tag:'ETF',title:'ETF 资金流向变化，黄金与科技主题产品关注度上升',source:'ETF观察',time:'1小时前'},
      {tag:'MACRO',title:'市场等待新的通胀和就业数据，利率预期重新定价',source:'唐人财经',time:'2小时前'}
    ]
  };

  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function read(key,fallback=null){try{const v=localStorage.getItem(key);return v===null?fallback:v}catch(e){return fallback}}
  function write(key,value){try{localStorage.setItem(key,value);return true}catch(e){return false}}
  function remove(key){try{localStorage.removeItem(key);return true}catch(e){return false}}
  function removeSession(key){try{sessionStorage.removeItem(key);return true}catch(e){return false}}
  function spark(symbol){
    const seed = Array.from(symbol).reduce((a,c)=>a+c.charCodeAt(0),0);
    return Array.from({length:18},(_,i)=>Math.round(20 + ((Math.sin((i+seed%7)/2.1)+1)*13) + ((seed*i)%11)/2));
  }
  function stockNews(symbol){
    const s=demo.stocks[symbol]; if(!s)return [];
    return [
      {tag:symbol,title:`${s.name} 今日波动受到市场关注，投资者继续评估盈利与估值`,source:'唐人财经',time:'10分钟前'},
      {tag:'SECTOR',title:`${s.sector}板块出现分化，资金在龙头与高估值个股之间重新配置`,source:'市场观察',time:'1小时前'},
      {tag:'RESEARCH',title:`机构更新 ${symbol} 研究观点，重点关注下一季度业务指引`,source:'研究摘要',time:'3小时前'}
    ];
  }
  function getWatchlist(){
    const raw=read('trfinance.watchlist',null);
    if(raw===null) return Object.values(demo.stocks).filter(s=>s.watch).map(s=>s.symbol);
    let list=[]; try{list=JSON.parse(raw)}catch(e){}
    return Array.isArray(list)?list.filter(s=>demo.stocks[s]):[];
  }
  function setWatchlist(list){return write('trfinance.watchlist',JSON.stringify(Array.from(new Set(list)).filter(s=>demo.stocks[s])))}
  function toggleWatch(symbol){symbol=String(symbol||'').toUpperCase();const list=getWatchlist();const i=list.indexOf(symbol);if(i>=0)list.splice(i,1);else if(demo.stocks[symbol])list.unshift(symbol);else return false;setWatchlist(list);return i<0}
  function getFundWatchlist(){let list=[];try{list=JSON.parse(read('trfinance.fundWatchlist','[]'))}catch(e){}return Array.isArray(list)?list.filter(s=>demo.funds.some(f=>f.symbol===s)):[]}
  function setFundWatchlist(list){return write('trfinance.fundWatchlist',JSON.stringify(Array.from(new Set(list)).filter(s=>demo.funds.some(f=>f.symbol===s))))}
  function toggleFundWatch(symbol){symbol=String(symbol||'').toUpperCase();const list=getFundWatchlist();const i=list.indexOf(symbol);if(i>=0)list.splice(i,1);else if(demo.funds.some(f=>f.symbol===symbol))list.unshift(symbol);else return false;setFundWatchlist(list);return i<0}
  function search(q){
    q=(q||'').trim().toLowerCase(); if(!q)return [];
    const stocks=Object.values(demo.stocks).filter(x=>x.symbol.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).map(x=>({...x,type:'stock'}));
    const funds=demo.funds.filter(x=>x.symbol.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).map(x=>({...x,type:'fund'}));
    return [...stocks,...funds].slice(0,8);
  }
  const runtime={mode:'demo',source:'牛来测试数据',updatedAt:demo.updatedAt,realTime:false,providerConfigured:false};
  function instrumentId(ref){return [ref?.symbol,ref?.mic_code||ref?.exchange||ref?.market,ref?.assetType||ref?.instrumentType||ref?.type].map(v=>String(v||'').trim().toUpperCase()).join('|')}
  function instrumentRef(value){
    if(typeof value==='string')return {symbol:value.toUpperCase()};
    return {symbol:String(value?.symbol||'').toUpperCase(),name:value?.name||'',exchange:value?.exchange||value?.market||'',mic_code:value?.mic_code||'',assetType:value?.assetType||value?.instrumentType||value?.type||'',route:value?.route||(/ETF|Fund/i.test(value?.assetType||value?.instrumentType||value?.type||'')?'fund':'stock'),group:value?.group||''};
  }
  function detailHref(value){const ref=instrumentRef(value),page=ref.route==='fund'?'fund.html':'stock.html',p=new URLSearchParams({symbol:ref.symbol});if(ref.exchange)p.set('exchange',ref.exchange);if(ref.assetType)p.set('type',ref.assetType);return `${page}?${p.toString()}`}
  function setSelectedInstrument(value){const ref=instrumentRef(value);try{sessionStorage.setItem('trfinance.selectedInstrument',JSON.stringify({...ref,id:instrumentId(ref),ts:Date.now()}))}catch(e){}return ref}
  function getSelectedInstrument(symbol=''){try{const ref=JSON.parse(sessionStorage.getItem('trfinance.selectedInstrument')||'null');return ref&&(!symbol||ref.symbol===String(symbol).toUpperCase())?ref:null}catch(e){return null}}
  function readQuoteCache(){try{const value=JSON.parse(read('trfinance.quoteCache','{}'));return value&&typeof value==='object'?value:{}}catch(e){return {}}}
  function cacheQuote(value){if(!value?.symbol)return value;const data=readQuoteCache(),ref=instrumentRef(value),id=instrumentId(ref);data[id]={...value,_cachedAt:Date.now()};const entries=Object.entries(data).sort((a,b)=>(b[1]._cachedAt||0)-(a[1]._cachedAt||0)).slice(0,50);write('trfinance.quoteCache',JSON.stringify(Object.fromEntries(entries)));return value}
  function getCachedQuote(value){const ref=instrumentRef(value),data=readQuoteCache(),exact=data[instrumentId(ref)];if(exact)return clone(exact);const match=Object.values(data).find(x=>x.symbol===ref.symbol&&(!ref.exchange||x.exchange===ref.exchange||x.market===ref.exchange));return match?clone(match):null}
  async function api(path,params={}){const url=new URL(path,location.origin);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v))});const response=await fetch(url,{headers:{Accept:'application/json'}});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error||`财经接口请求失败（${response.status}）`);return body}
  async function refreshMeta(){try{const body=await api('/api/finance/status');runtime.mode=body.mode||'demo';runtime.source=body.provider||runtime.source;runtime.updatedAt=body.checkedAt||new Date().toISOString();runtime.realTime=body.mode==='provider';runtime.providerConfigured=!!body.providerConfigured;runtime.coverage=body.coverage||null;return clone(runtime)}catch(e){return clone(runtime)}}
  async function searchAsync(q,{market='all',limit=24}={}){q=String(q||'').trim();if(!q)return [];try{const body=await api('/api/finance/search',{q,market,limit});runtime.mode=body.mode||runtime.mode;runtime.source=body.mode==='provider'?'Twelve Data':'牛来测试数据';runtime.realTime=body.mode==='provider';return (body.items||[]).map(item=>({...item,type:item.route||(/ETF|Fund/i.test(item.type||'')?'fund':'stock'),assetType:item.type,market:item.exchange,detailHref:detailHref(item)}))}catch(e){return search(q)}}
  function hydrateQuote(value){if(!value)return null;const q={...value};q.symbol=String(q.symbol||'').toUpperCase();q.market=q.market||q.exchange||'—';q.exchange=q.exchange||q.market;q.assetType=q.assetType||q.type||'Common Stock';q.type=/ETF|Fund/i.test(q.assetType)?'fund':'stock';q.route=q.type;q.spark=Array.isArray(q.spark)&&q.spark.length?q.spark:spark(q.symbol);q.news=Array.isArray(q.news)&&q.news.length?q.news:stockNews(q.symbol);q.change=Number(q.change)||0;q.after=Number(q.after)||0;q.price=Number(q.price)||0;q.prev=Number(q.prev)||q.price;q.open=Number(q.open)||q.prev;q.high=Number(q.high)||q.price;q.low=Number(q.low)||q.price;q.volume=q.volume||'—';q.marketCap=q.marketCap||'—';q.pe=q.pe??'—';q.range52=q.range52||'—';q.sector=q.sector||q.assetType||'证券';q.description=q.description||`${q.name||q.symbol}（${q.symbol}）证券详情。`;q.id=q.id||instrumentId(q);return q}
  async function getQuoteAsync(value){const selected=getSelectedInstrument(typeof value==='string'?value:value?.symbol)||{},explicit=instrumentRef(value),ref={...selected,...Object.fromEntries(Object.entries(explicit).filter(([,v])=>v!==''&&v!==null&&v!==undefined))},local=demo.stocks[ref.symbol];try{const body=await api('/api/finance/quote',{symbol:ref.symbol,exchange:ref.exchange,type:ref.assetType});runtime.mode=body.mode||runtime.mode;runtime.source=body.mode==='provider'?'Twelve Data':'牛来测试数据';runtime.updatedAt=body.asOf||new Date().toISOString();runtime.realTime=body.mode==='provider';const quote=hydrateQuote({...body.quote,series:body.series||body.quote?.series});cacheQuote(quote);return quote}catch(e){return getCachedQuote(ref)||hydrateQuote(local)} }
  async function getFundAsync(value){const ref=instrumentRef(value),local=demo.funds.find(f=>f.symbol===ref.symbol);try{const q=await getQuoteAsync({...ref,assetType:ref.assetType||'ETF',route:'fund'});if(!q)return local?{...clone(local),assetType:'ETF',exchange:'US',route:'fund'}:null;return {...q,category:/Mutual Fund/i.test(q.assetType)?'共同基金':'ETF / 基金',expense:q.expense||'待正式数据',aum:q.aum||q.marketCap||'—',risk:q.risk||'待评估',holdings:Array.isArray(q.holdings)?q.holdings:[]}}catch(e){return local?{...clone(local),assetType:'ETF',exchange:'US',route:'fund'}:null}}
  async function getFinanceNews(limit=12){try{const body=await api('/api/finance/news',{limit});return Array.isArray(body.articles)?body.articles:[]}catch(e){return []}}
  function getSecurityWatchlist(){let list=[];try{list=JSON.parse(read('trfinance.securityWatchlist','[]'))}catch(e){}return Array.isArray(list)?list.map(instrumentRef).filter(x=>x.symbol):[]}
  function setSecurityWatchlist(list){const normalized=Array.from(new Map((Array.isArray(list)?list:[]).map(value=>{const ref=instrumentRef(value);return [instrumentId(ref),ref]})).values());return write('trfinance.securityWatchlist',JSON.stringify(normalized))}
  function isSecurityWatched(value){const id=instrumentId(instrumentRef(value));return getSecurityWatchlist().some(item=>instrumentId(item)===id)}
  function toggleSecurityWatch(value){const ref=instrumentRef(value),id=instrumentId(ref),list=getSecurityWatchlist(),index=list.findIndex(item=>instrumentId(item)===id);if(index>=0)list.splice(index,1);else list.unshift(ref);setSecurityWatchlist(list);return index<0}
  function getAlertRules(){let rules=[];try{rules=JSON.parse(read('trfinance.alertRules','[]'))}catch(e){}return Array.isArray(rules)?rules:[]}
  function isInstrumentAlertOn(value){const id=instrumentId(instrumentRef(value));return getAlertRules().some(rule=>rule.id===id&&rule.enabled!==false)}
  function setInstrumentAlert(value,on,rule={}){const ref=instrumentRef(value),id=instrumentId(ref),rules=getAlertRules().filter(item=>item.id!==id);if(on)rules.unshift({id,instrument:ref,enabled:true,condition:rule.condition||'move',threshold:Number(rule.threshold)||3,createdAt:new Date().toISOString()});return write('trfinance.alertRules',JSON.stringify(rules))}
  function toggleInstrumentAlert(value,rule={}){const next=!isInstrumentAlertOn(value);setInstrumentAlert(value,next,rule);return next}
  function getMarketSession(date=new Date()){
    try{
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
      if(['Sat','Sun'].includes(parts.weekday))return {code:'closed',label:'休市',note:'周末 · 美东时间'};
      const mins=Number(parts.hour)*60+Number(parts.minute);
      if(mins>=240&&mins<570)return {code:'pre',label:'盘前',note:'美东 04:00–09:30'};
      if(mins>=570&&mins<960)return {code:'regular',label:'交易中',note:'美东 09:30–16:00'};
      if(mins>=960&&mins<1200)return {code:'after',label:'盘后',note:'美东 16:00–20:00'};
      return {code:'closed',label:'休市',note:'非交易时段'};
    }catch(e){return {code:'unknown',label:'市场状态未知',note:'时间状态不可用'}}
  }
  function isAlertOn(symbol){return read(`trfinance.alert.${String(symbol||'').toUpperCase()}`,'0')==='1'}
  function setAlert(symbol,on){symbol=String(symbol||'').toUpperCase();if(!demo.stocks[symbol])return false;return write(`trfinance.alert.${symbol}`,on?'1':'0')}
  function toggleAlert(symbol){const next=!isAlertOn(symbol);setAlert(symbol,next);return next}
  function getAlerts(){return Object.keys(demo.stocks).filter(isAlertOn).map(symbol=>({symbol,name:demo.stocks[symbol].name}))}
  function clearHistory(){remove('trfinance.history')}
  function clearAlerts(){Object.keys(demo.stocks).forEach(symbol=>remove(`trfinance.alert.${symbol}`));remove('trfinance.alertRules')}
  function clearLocalState(){
    ['trfinance.watchlist','trfinance.fundWatchlist','trfinance.securityWatchlist','trfinance.quoteCache','trfinance.alertRules','trfinance.watchView','trfinance.watchSort','trfinance.history','trfinance.prefs'].forEach(remove);
    ['trfinance.navState','trfinance.navContext'].forEach(removeSession);
    clearAlerts();
    return true;
  }
  function getMeta(){return {...clone(runtime),session:getMarketSession()}}
  window.FinanceData={
    mode:'demo',
    getMeta,
    getMarketSnapshot:()=>clone(demo),
    getQuote:(symbol)=>{const s=demo.stocks[String(symbol||'').toUpperCase()];return s?{...clone(s),spark:spark(s.symbol),news:stockNews(s.symbol)}:null},
    getFund:(symbol)=>clone(demo.funds.find(f=>f.symbol===String(symbol||'').toUpperCase())||null),
    getWatchlist,setWatchlist,toggleWatch,
    getFundWatchlist,setFundWatchlist,toggleFundWatch,
    isAlertOn,setAlert,toggleAlert,getAlerts,clearAlerts,clearHistory,clearLocalState,
    search,searchAsync,getQuoteAsync,getFundAsync,getFinanceNews,refreshMeta,
    instrumentId,instrumentRef,detailHref,setSelectedInstrument,getSelectedInstrument,getCachedQuote,
    getSecurityWatchlist,setSecurityWatchlist,isSecurityWatched,toggleSecurityWatch,
    getAlertRules,isInstrumentAlertOn,setInstrumentAlert,toggleInstrumentAlert,
    spark
  };
})();
