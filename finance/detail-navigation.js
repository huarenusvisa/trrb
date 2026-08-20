(function(){
  const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const top=$('.stock-top'),content=$('.stock-content'),hero=$('.stock-hero'),ticker=$('.stock-ticker');if(!top||!content||!hero||!ticker)return;
  const isFund=!!$('#fundName');
  const labels=isFund?['概览','基金概览','核心持仓','相关资讯','风险说明']:['概览','关键数据','新闻','分析师评级','营收与利润','财报','公告','热度','公司概览'];
  const sections=[hero,...$$('.stock-section',content)];
  sections.forEach((s,i)=>{if(!s.id)s.id=`detail-section-${i}`});
  const nav=document.createElement('nav');nav.className='detail-nav';nav.setAttribute('aria-label',isFund?'基金详情分区':'个股详情分区');
  nav.innerHTML=sections.map((s,i)=>`<a href="#${s.id}" class="${i===0?'on':''}" data-index="${i}">${labels[i]||$('h2',s)?.textContent||`分区${i+1}`}</a>`).join('');
  hero.insertAdjacentElement('afterend',nav);
  const links=$$('a',nav);
  links.forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.getAttribute('href').slice(1),target=document.getElementById(id);if(!target)return;target.scrollIntoView({behavior:document.documentElement.classList.contains('reduce-motion')?'auto':'smooth',block:'start'});history.replaceState(null,'',`${location.pathname}${location.search}#${id}`)}));
  const setActive=i=>{links.forEach((a,n)=>{const on=n===i;a.classList.toggle('on',on);a.setAttribute('aria-current',on?'location':'false')});const a=links[i];if(a)a.scrollIntoView({block:'nearest',inline:'center'})};
  if('IntersectionObserver'in window){
    const io=new IntersectionObserver(entries=>{const visible=entries.filter(x=>x.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(!visible.length)return;const i=sections.indexOf(visible[0].target);if(i>=0)setActive(i)},{rootMargin:'-118px 0px -68% 0px',threshold:[0,.01,.15]});sections.forEach(s=>io.observe(s));
  }
  let ticking=false;const syncScroll=()=>{top.classList.toggle('detail-scrolled',window.scrollY>Math.max(110,hero.offsetTop+90));ticking=false};
  window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(syncScroll)}},{passive:true});syncScroll();

  const stockPrice=$('#topPrice'),stockSymbol=$('#topSymbol'),fundSymbol=$('#fundSymbol');let basePrimary='',baseSecondary='';
  const ensureFundHeader=()=>{if(!isFund)return;const price=$('#fundPrice')?.textContent||'—',change=$('#fundChange')?.textContent||'';if(fundSymbol)fundSymbol.textContent=price;const span=$('span',ticker);if(span)span.innerHTML=`${$('#fundName')?.textContent||''} <em class="mini-change ${($('#fundChange')?.classList.contains('down'))?'down':'up'}">${change}</em>`};
  const captureBase=()=>{if(isFund){ensureFundHeader();basePrimary=fundSymbol?.textContent||'';baseSecondary=$('span',ticker)?.innerHTML||''}else{basePrimary=stockPrice?.textContent||'';const change=$('#move')?.textContent||'',sign=$('#move')?.classList.contains('down')?'down':'up';if(stockSymbol){const sym=stockSymbol.textContent;stockSymbol.innerHTML=`${sym} <em class="mini-change ${sign}">${change.match(/\([^)]*\)/)?.[0]||''}</em>`}baseSecondary=stockSymbol?.innerHTML||''}};
  const restoreHeader=()=>{ticker.classList.remove('chart-reading');if(isFund){if(fundSymbol)fundSymbol.textContent=basePrimary;const span=$('span',ticker);if(span)span.innerHTML=baseSecondary}else{if(stockPrice)stockPrice.textContent=basePrimary;if(stockSymbol)stockSymbol.innerHTML=baseSecondary}};
  const showReading=(price,range)=>{ticker.classList.add('chart-reading');if(isFund){if(fundSymbol)fundSymbol.textContent=price||basePrimary;const span=$('span',ticker);if(span)span.textContent=`${range||''} · ${$('#fundName')?.textContent||''}`}else{if(stockPrice)stockPrice.textContent=price||basePrimary;if(stockSymbol)stockSymbol.textContent=`${range||''} · ${$('#symbol')?.textContent||''}`}};
  requestAnimationFrame(()=>requestAnimationFrame(captureBase));

  const chartHost=isFund?$('#fundChart'):$('#chart');
  if(chartHost&&'MutationObserver'in window){
    let lastVisible=false;
    const syncTip=()=>{const tip=$('.chart-scrub-tip',chartHost);if(!tip)return;const visible=tip.style.opacity==='1';if(visible){const price=(tip.childNodes[0]?.textContent||tip.textContent||'').trim(),range=$('.range button.on')?.dataset.range||'';showReading(price,range)}else if(lastVisible)restoreHeader();lastVisible=visible};
    const mo=new MutationObserver(()=>requestAnimationFrame(syncTip));mo.observe(chartHost,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});syncTip();
  }
})();
