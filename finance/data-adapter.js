(function(){
  const now = new Date();
  const demo = {
    updatedAt: now.toISOString(),
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
      BABA:{symbol:'BABA',name:'阿里巴巴',market:'NYSE',price:161.28,change:1.86,after:0.03,open:158.70,high:162.52,low:157.83,prev:158.33,marketCap:'385B',pe:'24.1',volume:'18.3M',range52:'73–176',sector:'中概互联网',description:'阿里巴巴经营电子商务、云计算、物流和数字媒体业务。',watch:true}
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

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function spark(symbol){
    const seed = Array.from(symbol).reduce((a,c)=>a+c.charCodeAt(0),0);
    return Array.from({length:18},(_,i)=>Math.round(20 + ((Math.sin((i+seed%7)/2.1)+1)*13) + ((seed*i)%11)/2));
  }
  function stockNews(symbol){
    const s=demo.stocks[symbol]||demo.stocks.AAPL;
    return [
      {tag:symbol,title:`${s.name} 今日波动受到市场关注，投资者继续评估盈利与估值`,source:'唐人财经',time:'10分钟前'},
      {tag:'SECTOR',title:`${s.sector}板块出现分化，资金在龙头与高估值个股之间重新配置`,source:'市场观察',time:'1小时前'},
      {tag:'RESEARCH',title:`机构更新 ${symbol} 研究观点，重点关注下一季度业务指引`,source:'研究摘要',time:'3小时前'}
    ];
  }
  function getWatchlist(){
    let list=[];
    try{ list=JSON.parse(localStorage.getItem('trfinance.watchlist')||'[]'); }catch(e){}
    if(!Array.isArray(list)||!list.length) list=Object.values(demo.stocks).filter(s=>s.watch).map(s=>s.symbol);
    return list.filter(s=>demo.stocks[s]);
  }
  function setWatchlist(list){localStorage.setItem('trfinance.watchlist',JSON.stringify(Array.from(new Set(list)).filter(s=>demo.stocks[s])));}
  function toggleWatch(symbol){const list=getWatchlist();const i=list.indexOf(symbol);if(i>=0)list.splice(i,1);else if(demo.stocks[symbol])list.unshift(symbol);setWatchlist(list);return i<0;}
  function search(q){
    q=(q||'').trim().toLowerCase(); if(!q)return [];
    const stocks=Object.values(demo.stocks).filter(x=>x.symbol.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).map(x=>({...x,type:'stock'}));
    const funds=demo.funds.filter(x=>x.symbol.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).map(x=>({...x,type:'fund'}));
    return [...stocks,...funds].slice(0,8);
  }
  window.FinanceData={
    mode:'demo',
    getMarketSnapshot:()=>clone(demo),
    getQuote:(symbol)=>{const s=demo.stocks[String(symbol||'AAPL').toUpperCase()]||demo.stocks.AAPL;return {...clone(s),spark:spark(s.symbol),news:stockNews(s.symbol)};},
    getFund:(symbol)=>clone(demo.funds.find(f=>f.symbol===String(symbol||'SPY').toUpperCase())||demo.funds[0]),
    getWatchlist,
    setWatchlist,
    toggleWatch,
    search,
    spark
  };
})();
