(function(){
  const D=window.FinanceData;if(!D)return;
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const symbol=(new URLSearchParams(location.search).get('symbol')||'AAPL').toUpperCase();
  const q=D.getQuote(symbol);const money=v=>typeof v==='number'?v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):v;const cls=v=>v>=0?'up':'down';
  document.title=`${q.name} (${q.symbol})｜唐人财经`;
  function recordHistory(){let h=[];try{h=JSON.parse(localStorage.getItem('trfinance.history')||'[]')}catch(e){}h=[{type:'stock',symbol:q.symbol,name:q.name,ts:Date.now()},...h.filter(x=>!(x.type==='stock'&&x.symbol===q.symbol))].slice(0,20);localStorage.setItem('trfinance.history',JSON.stringify(h));}
  recordHistory();
  $('#symbol').textContent=q.symbol;$('#name').textContent=q.name;$('#topSymbol').textContent=q.symbol;$('#topPrice').textContent=`$${money(q.price)}`;$('#price').textContent=`$${money(q.price)}`;$('#market').textContent=q.market;
  $('#move').className=`move ${cls(q.change)}`;$('#move').textContent=`${q.change>=0?'▲':'▼'} $${Math.abs(q.price-q.prev).toFixed(2)} (${Math.abs(q.change).toFixed(2)}%)  Today`;
  $('#after').className=`after ${cls(q.after)}`;$('#after').textContent=`${q.after>=0?'▲':'▼'} ${Math.abs(q.after).toFixed(2)}%  After-hours`;
  const metrics=[['今开',q.open],['最高',q.high],['最低',q.low],['昨收',q.prev],['市值',q.marketCap],['市盈率',q.pe],['成交量',q.volume],['52周区间',q.range52]];$('#metrics').innerHTML=metrics.map(x=>`<div class="metric"><small>${x[0]}</small><b>${typeof x[1]==='number'?money(x[1]):x[1]}</b></div>`).join('');
  $('#stockNews').innerHTML=q.news.map(n=>`<a class="news" href="#"><div><b>${n.title}</b><small>${n.source} · ${n.time}</small></div><div class="thumb">${n.tag}</div></a>`).join('');
  $('#description').textContent=q.description;$('#sector').textContent=q.sector;
  function chart(points){const max=Math.max(...points),min=Math.min(...points),w=800,h=400;const pts=points.map((v,i)=>`${(i/(points.length-1))*w},${h-30-((v-min)/(max-min||1))*(h-80)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="${q.symbol} 价格走势图"><line x1="0" y1="${h*.72}" x2="${w}" y2="${h*.72}" stroke="#a8afb3" stroke-width="1" stroke-dasharray="3 5"/><polyline points="${pts}" fill="none" stroke="${q.change>=0?'#00c805':'#ff4d2e'}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${w}" cy="${pts.split(' ').at(-1).split(',')[1]}" r="6" fill="${q.change>=0?'#00c805':'#ff4d2e'}"/></svg>`}
  $('#chart').innerHTML=chart([...q.spark,...q.spark.map((v,i)=>v+(i%4)-2),...q.spark.slice(4)]);
  $$('.range button[data-range]').forEach((b,i)=>b.addEventListener('click',()=>{$$('.range button[data-range]').forEach(x=>x.classList.toggle('on',x===b));const factor=i+1;$('#chart').innerHTML=chart(Array.from({length:46},(_,n)=>24+Math.sin((n+factor*3)/3)*11+Math.sin(n/7)*8+(n*factor%13)/3))}));
  const watchBtn=$('#watchBtn');function syncWatch(){watchBtn.textContent=D.getWatchlist().includes(q.symbol)?'✓ 已自选':'+ 加入自选'}syncWatch();watchBtn.addEventListener('click',()=>{D.toggleWatch(q.symbol);syncWatch()});
  $('#alertBtn').addEventListener('click',()=>{const key=`trfinance.alert.${q.symbol}`;const on=localStorage.getItem(key)==='1';localStorage.setItem(key,on?'0':'1');$('#alertBtn').textContent=on?'设置提醒':'✓ 已设置提醒'});
  $('#shareBtn').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else await navigator.clipboard.writeText(location.href)}catch(e){}});
})();
