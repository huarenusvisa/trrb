(()=>{
  const PAGE_SIZE=20;
  const params=new URLSearchParams(location.search);
  const state={
    q:(params.get('q')||'').trim(),
    source:(params.get('source')||'').trim(),
    body:(params.get('body')||'').trim(),
    type:(params.get('type')||'').trim(),
    from:(params.get('from')||'').trim(),
    to:(params.get('to')||'').trim(),
    sort:(params.get('sort')||'relevance').trim(),
    page:Math.max(1,Number(params.get('page')||1)||1),
    records:[],analysis:new Map(),version:''
  };
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={SCOTUS:'美国最高法院',US_CIRCUIT:'联邦巡回上诉法院',BIA:'BIA先例裁决',WHITE_HOUSE:'白宫行政命令',FEDERAL_REGISTER:'Federal Register'};
  function norm(v){return String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}
  function terms(v){return norm(v).split(/\s+/).filter(Boolean)}
  function displayDate(v){if(!v)return'日期未提取';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  function officialSearchFields(r){return [r.title,r.docket,r.citation,r.issuingBody,r.authorityType,r.sourceSystem]}
  function analysisSearchFields(r){const a=state.analysis.get(r.id)||{};return [a.chineseTitle,a.summary,a.legalIssue,a.holdingOrRule,a.impact]}
  function relevanceScore(r,q){
    const query=norm(q);if(!query)return 0;
    const ts=terms(query),title=norm(r.title),docket=norm(r.docket),citation=norm(r.citation);
    const body=norm(r.issuingBody),authority=norm(r.authorityType),source=norm(r.sourceSystem);
    const ai=analysisSearchFields(r).map(norm);
    let score=0;
    if(title===query)score+=140;else if(title.includes(query))score+=85;
    if(docket===query)score+=160;else if(docket.includes(query))score+=95;
    if(citation===query)score+=160;else if(citation.includes(query))score+=95;
    if(body===query)score+=65;else if(body.includes(query))score+=35;
    if(authority===query||source===query)score+=45;
    for(const t of ts){
      if(!t)continue;
      if(title.includes(t))score+=18;
      if(docket.includes(t)||citation.includes(t))score+=24;
      if(body.includes(t)||authority.includes(t)||source.includes(t))score+=8;
      ai.forEach((v,i)=>{if(v.includes(t))score+=i===0?12:6});
    }
    if(ai.some(v=>v.includes(query)))score+=18;
    return score;
  }
  function matches(r,q){const query=norm(q);if(!query)return true;const haystack=[...officialSearchFields(r),...analysisSearchFields(r)].map(norm).join(' ');return terms(query).every(t=>haystack.includes(t))}
  function validDateInput(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)}
  function inDateRange(r){const d=String(r.publicationDate||'').slice(0,10);if(!d)return !state.from&&!state.to;if(state.from&&d<state.from)return false;if(state.to&&d>state.to)return false;return true}
  function dateDesc(a,b){return String(b.publicationDate||'').localeCompare(String(a.publicationDate||''))||String(a.issuingBody||'').localeCompare(String(b.issuingBody||''))||String(a.title||'').localeCompare(String(b.title||''))}
  function defaultSorted(records){return [...records].sort(dateDesc)}
  function filtered(){
    const scoped=state.records.filter(r=>(!state.source||r.sourceSystem===state.source)&&(!state.body||r.issuingBody===state.body)&&(!state.type||r.authorityType===state.type)&&inDateRange(r)&&matches(r,state.q));
    if(state.sort==='oldest')return [...scoped].sort((a,b)=>String(a.publicationDate||'').localeCompare(String(b.publicationDate||''))||String(a.title||'').localeCompare(String(b.title||'')));
    if(state.sort==='newest'||!state.q)return defaultSorted(scoped);
    return [...scoped].sort((a,b)=>relevanceScore(b,state.q)-relevanceScore(a,state.q)||dateDesc(a,b));
  }
  function fillSelect(el,values,label,desired=''){const selected=desired||el.value;el.innerHTML=`<option value="">${label}</option>`+[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if([...el.options].some(o=>o.value===selected))el.value=selected;else el.value=''}
  function analysisHtml(r){const a=state.analysis.get(r.id);if(!a)return`<div class="analysis"><h3>中文解析</h3><p class="muted">中文裁判要旨/规则解析正在生成；请先以官方原文为准。</p></div>`;return`<div class="analysis"><h3>${esc(a.chineseTitle||'中文解析')}</h3><p><strong>要旨：</strong>${esc(a.summary)}</p><p><strong>法律问题：</strong>${esc(a.legalIssue)}</p><p><strong>裁判/规则：</strong>${esc(a.holdingOrRule)}</p><p><strong>影响范围：</strong>${esc(a.impact)}</p><p class="muted">${esc(a.disclaimer)}</p></div>`}
  function card(r){const title=r.title||r.citation||r.docket||`${labels[r.sourceSystem]||r.sourceSystem}资料`;const detail=`/legal/detail.html?id=${encodeURIComponent(r.id)}`;return`<article class="legal-card" data-record-id="${esc(r.id)}"><div class="legal-card-top"><span class="badge">${esc(labels[r.sourceSystem]||r.sourceSystem)}</span><span class="badge kind">${esc(r.authorityType)}</span></div><h2><a class="legal-title-link" href="${detail}">${esc(title)}</a></h2><div class="meta"><span>${esc(r.issuingBody)}</span><span>${esc(displayDate(r.publicationDate))}</span>${r.docket?`<span>案号 ${esc(r.docket)}</span>`:''}${r.citation?`<span>${esc(r.citation)}</span>`:''}</div>${analysisHtml(r)}<div class="card-actions"><a class="primary" href="${detail}">查看详情</a><a href="${esc(r.officialUrl)}" target="_blank" rel="noopener noreferrer">查看官方原文</a>${r.officialPdfUrl&&r.officialPdfUrl!==r.officialUrl?`<a href="${esc(r.officialPdfUrl)}" target="_blank" rel="noopener noreferrer">官方PDF</a>`:''}</div></article>`}
  function writeUrl(){const p=new URLSearchParams();if(state.q)p.set('q',state.q);if(state.source)p.set('source',state.source);if(state.body)p.set('body',state.body);if(state.type)p.set('type',state.type);if(state.from)p.set('from',state.from);if(state.to)p.set('to',state.to);if(state.sort&&state.sort!=='relevance')p.set('sort',state.sort);if(state.page>1)p.set('page',String(state.page));const next=`${location.pathname}${p.toString()?`?${p}`:''}`;history.replaceState(null,'',next)}
  function render(){const data=filtered(),pages=Math.max(1,Math.ceil(data.length/PAGE_SIZE));if(state.page>pages)state.page=pages;const start=(state.page-1)*PAGE_SIZE,rows=data.slice(start,start+PAGE_SIZE);$('#legal-count').textContent=`共 ${data.length} 条符合条件的官方法律资料`;$('#legal-version').textContent=state.version?`数据库版本 ${state.version.slice(0,12)}`:'';$('#legal-list').innerHTML=rows.length?rows.map(card).join(''):'<div class="empty">没有找到符合当前条件的记录。</div>';$('#legal-page').textContent=`${state.page} / ${pages}`;$('#legal-prev').disabled=state.page<=1;$('#legal-next').disabled=state.page>=pages;document.querySelectorAll('.source-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.source===state.source));document.querySelectorAll('[data-circuit-body]').forEach(b=>b.classList.toggle('active',state.source==='US_CIRCUIT'&&b.dataset.circuitBody===state.body));const circuitNav=$('#circuit-nav');if(circuitNav)circuitNav.classList.toggle('is-visible',state.source==='US_CIRCUIT');writeUrl()}
  function syncFilters(desiredBody=state.body,desiredType=state.type){const scoped=state.source?state.records.filter(r=>r.sourceSystem===state.source):state.records;fillSelect($('#legal-body'),scoped.map(r=>r.issuingBody),'全部机构',desiredBody);fillSelect($('#legal-type'),scoped.map(r=>r.authorityType),'全部类型',desiredType);state.body=$('#legal-body').value;state.type=$('#legal-type').value}
  function resetPageRender(){state.page=1;render()}
  function bind(){let timer;$('#legal-q').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=e.target.value.trim();resetPageRender()},180)});$('#legal-source').addEventListener('change',e=>{state.source=e.target.value;state.body='';state.type='';state.page=1;syncFilters();render()});$('#legal-body').addEventListener('change',e=>{state.body=e.target.value;resetPageRender()});$('#legal-type').addEventListener('change',e=>{state.type=e.target.value;resetPageRender()});$('#legal-from').addEventListener('change',e=>{state.from=validDateInput(e.target.value)?e.target.value:'';resetPageRender()});$('#legal-to').addEventListener('change',e=>{state.to=validDateInput(e.target.value)?e.target.value:'';resetPageRender()});$('#legal-sort').addEventListener('change',e=>{state.sort=['relevance','newest','oldest'].includes(e.target.value)?e.target.value:'relevance';resetPageRender()});$('#legal-reset').addEventListener('click',()=>{state.q=state.source=state.body=state.type=state.from=state.to='';state.sort='relevance';state.page=1;$('#legal-q').value='';$('#legal-source').value='';$('#legal-from').value='';$('#legal-to').value='';$('#legal-sort').value='relevance';syncFilters();render()});document.querySelectorAll('.source-tabs button').forEach(b=>b.addEventListener('click',()=>{state.source=b.dataset.source||'';state.body='';state.type='';$('#legal-source').value=state.source;state.page=1;syncFilters();render()}));document.querySelectorAll('[data-circuit-body]').forEach(b=>b.addEventListener('click',()=>{state.source='US_CIRCUIT';state.body=b.dataset.circuitBody||'';state.type='';state.page=1;$('#legal-source').value='US_CIRCUIT';syncFilters(state.body,'');render()}));$('#legal-prev').addEventListener('click',()=>{if(state.page>1){state.page--;render();scrollTo({top:document.querySelector('.status-row').offsetTop-90,behavior:'smooth'})}});$('#legal-next').addEventListener('click',()=>{const pages=Math.max(1,Math.ceil(filtered().length/PAGE_SIZE));if(state.page<pages){state.page++;render();scrollTo({top:document.querySelector('.status-row').offsetTop-90,behavior:'smooth'})}})}
  async function load(){try{const [dbRes,aiRes]=await Promise.all([fetch('/data/legal/unified-legal-authorities-latest.json',{cache:'no-store'}),fetch('/data/legal/legal-ai-analysis-latest.json',{cache:'no-store'})]);if(!dbRes.ok)throw new Error(`数据库HTTP ${dbRes.status}`);const db=await dbRes.json();state.records=Array.isArray(db.records)?db.records:[];state.version=db.datasetVersion||'';if(aiRes.ok){const ai=await aiRes.json();state.analysis=new Map((ai.analyses||[]).map(a=>[a.recordId,a]))}const allowed=new Set(['','SCOTUS','US_CIRCUIT','BIA','WHITE_HOUSE','FEDERAL_REGISTER']);if(!allowed.has(state.source))state.source='';if(!validDateInput(state.from))state.from='';if(!validDateInput(state.to))state.to='';if(!['relevance','newest','oldest'].includes(state.sort))state.sort='relevance';$('#legal-q').value=state.q;$('#legal-source').value=state.source;$('#legal-from').value=state.from;$('#legal-to').value=state.to;$('#legal-sort').value=state.sort;syncFilters(state.body,state.type);render()}catch(e){$('#legal-count').textContent='数据库加载失败';$('#legal-list').innerHTML=`<div class="empty">暂时无法加载法律数据库：${esc(e.message)}。请稍后重试。</div>`}}
  bind();load();
})();
