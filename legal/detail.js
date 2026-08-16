(()=>{
  const params=new URLSearchParams(location.search);
  const recordId=(params.get('id')||'').trim();
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={SCOTUS:'美国最高法院',US_CIRCUIT:'联邦巡回上诉法院',BIA:'BIA先例裁决',WHITE_HOUSE:'白宫行政命令',FEDERAL_REGISTER:'Federal Register'};
  function displayDate(v){if(!v)return'日期未提取';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  function titleOf(r){return r.title||r.citation||r.docket||`${labels[r.sourceSystem]||r.sourceSystem}资料`}
  function pair(label,value){if(value===null||value===undefined||String(value).trim()==='')return'';return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`}
  function normWords(v){return new Set(String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(w=>w.length>=3))}
  function overlapScore(a,b){let score=0;const aw=normWords(`${a.title||''} ${a.citation||''} ${a.docket||''}`),bw=normWords(`${b.title||''} ${b.citation||''} ${b.docket||''}`);for(const w of aw){if(bw.has(w))score+=1}return score}
  function relatedScore(base,candidate){
    let score=0;
    if(base.issuingBody&&candidate.issuingBody===base.issuingBody)score+=60;
    if(base.sourceSystem&&candidate.sourceSystem===base.sourceSystem)score+=30;
    if(base.authorityType&&candidate.authorityType===base.authorityType)score+=20;
    if(base.jurisdiction&&candidate.jurisdiction===base.jurisdiction)score+=10;
    score+=Math.min(20,overlapScore(base,candidate)*4);
    return score;
  }
  function relatedRecords(base,records){
    return records.filter(r=>String(r.id)!==String(base.id)).map(r=>({r,score:relatedScore(base,r)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(b.r.publicationDate||'').localeCompare(String(a.r.publicationDate||''))||titleOf(a.r).localeCompare(titleOf(b.r),'zh-CN')).slice(0,6).map(x=>x.r);
  }
  function relatedCard(r){const detail=`/legal/detail.html?id=${encodeURIComponent(r.id)}`;return `<article class="legal-card"><div class="legal-card-top"><span class="badge">${esc(labels[r.sourceSystem]||r.sourceSystem)}</span><span class="badge kind">${esc(r.authorityType||'法律资料')}</span></div><h3><a class="legal-title-link" href="${detail}">${esc(titleOf(r))}</a></h3><div class="meta"><span>${esc(r.issuingBody||'')}</span><span>${esc(displayDate(r.publicationDate))}</span>${r.docket?`<span>案号 ${esc(r.docket)}</span>`:''}</div><div class="card-actions"><a class="primary" href="${detail}">查看详情</a>${r.officialUrl?`<a href="${esc(r.officialUrl)}" target="_blank" rel="noopener noreferrer">官方原文</a>`:''}</div></article>`}
  function renderRelated(base,records){const related=relatedRecords(base,records);$('#detail-related-list').innerHTML=related.length?related.map(relatedCard).join(''):'<p class="muted">当前数据库中暂无可确认的相关记录。</p>'}
  function analysisHtml(a){
    if(!a)return '<p class="muted">这条资料的中文裁判要旨/规则解析尚未生成。当前页面仅展示已经从官方来源采集的结构化信息，请先以官方原文为准。</p>';
    return `${a.chineseTitle?`<h3>${esc(a.chineseTitle)}</h3>`:''}<p><strong>要旨：</strong>${esc(a.summary||'')}</p><p><strong>法律问题：</strong>${esc(a.legalIssue||'')}</p><p><strong>裁判/规则：</strong>${esc(a.holdingOrRule||'')}</p><p><strong>影响范围：</strong>${esc(a.impact||'')}</p><p class="muted">${esc(a.disclaimer||'')}</p>`;
  }
  function applySeo(r,a,title,canonical){
    const summary=(a&&a.summary)||`${labels[r.sourceSystem]||r.sourceSystem||'美国法律资料'}：${r.issuingBody||''}${r.citation?`，${r.citation}`:''}`;
    document.title=`${title}｜美国判例与新规｜唐人日报`;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical);
    let meta=document.querySelector('meta[name="description"]');
    if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta)}
    meta.setAttribute('content',String(summary).slice(0,180));
    document.querySelector('#legal-detail-jsonld')?.remove();
    const schema={
      '@context':'https://schema.org','@type':'WebPage',
      name:title,url:canonical,description:String(summary).slice(0,300),inLanguage:'zh-Hans',
      isPartOf:{'@type':'CollectionPage',name:'美国判例与新规',url:'https://trrb.net/legal/'},
      mainEntity:{'@type':'Legislation',name:title,url:r.officialUrl||canonical,legislationJurisdiction:r.jurisdiction||'United States',legislationDate:r.publicationDate||undefined,legislationIdentifier:r.citation||r.docket||r.sourceKey||recordId}
    };
    const script=document.createElement('script');script.type='application/ld+json';script.id='legal-detail-jsonld';script.textContent=JSON.stringify(schema);document.head.appendChild(script);
  }
  function fail(message){$('#detail-status').textContent=message;$('#detail-status').classList.add('is-error')}
  async function load(){
    if(!recordId){fail('缺少资料ID。请返回“美国判例与新规”数据库重新选择。');return}
    try{
      const [dbRes,aiRes]=await Promise.all([
        fetch('/data/legal/unified-legal-authorities-latest.json',{cache:'no-store'}),
        fetch('/data/legal/legal-ai-analysis-latest.json',{cache:'no-store'})
      ]);
      if(!dbRes.ok)throw new Error(`数据库HTTP ${dbRes.status}`);
      const db=await dbRes.json();
      const records=Array.isArray(db.records)?db.records:[];
      const r=records.find(item=>String(item.id)===recordId);
      if(!r){fail('这条法律资料当前不在数据库中，可能已被官方更新、合并或更正。');return}
      let a=null;
      if(aiRes.ok){const ai=await aiRes.json();a=(ai.analyses||[]).find(item=>String(item.recordId)===recordId)||null}
      const title=titleOf(r);
      const canonical=`https://trrb.net/legal/detail.html?id=${encodeURIComponent(recordId)}`;
      applySeo(r,a,title,canonical);
      $('#detail-source').textContent=labels[r.sourceSystem]||r.sourceSystem||'资料详情';
      $('#detail-source-badge').textContent=labels[r.sourceSystem]||r.sourceSystem||'官方资料';
      $('#detail-type').textContent=r.authorityType||'法律资料';
      $('#detail-title').textContent=title;
      const meta=[r.issuingBody,displayDate(r.publicationDate),r.docket?`案号 ${r.docket}`:'',r.citation||''].filter(Boolean);
      $('#detail-meta').innerHTML=meta.map(v=>`<span>${esc(v)}</span>`).join('');
      $('#detail-analysis').innerHTML=analysisHtml(a);
      $('#detail-fields-list').innerHTML=[
        pair('来源系统',labels[r.sourceSystem]||r.sourceSystem),pair('发布机构',r.issuingBody),pair('资料类型',r.authorityType),pair('发布日期',displayDate(r.publicationDate)),pair('案号',r.docket),pair('正式引证',r.citation),pair('管辖范围',r.jurisdiction),pair('先例状态',r.precedentialStatus),pair('来源键',r.sourceKey),pair('数据库版本',db.datasetVersion)
      ].join('');
      renderRelated(r,records);
      const official=[];
      if(r.officialUrl)official.push(`<a class="primary" href="${esc(r.officialUrl)}" target="_blank" rel="noopener noreferrer" data-official-primary="true">打开官方原文</a>`);
      if(r.officialPdfUrl&&r.officialPdfUrl!==r.officialUrl)official.push(`<a href="${esc(r.officialPdfUrl)}" target="_blank" rel="noopener noreferrer" data-official-pdf="true">打开官方PDF</a>`);
      $('#detail-official-actions').innerHTML=official.join('')||'<span class="muted">当前记录没有可用的官方原文链接。</span>';
      $('#detail-status').hidden=true;$('#detail-record').hidden=false;
    }catch(e){fail(`暂时无法加载资料：${e.message}`)}
  }
  load();
})();
