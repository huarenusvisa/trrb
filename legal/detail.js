(()=>{
  const params=new URLSearchParams(location.search);
  const recordId=(params.get('id')||'').trim();
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={SCOTUS:'美国最高法院',US_CIRCUIT:'联邦巡回上诉法院',BIA:'BIA先例裁决',WHITE_HOUSE:'白宫行政命令',FEDERAL_REGISTER:'Federal Register'};
  function displayDate(v){if(!v)return'日期未提取';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  function titleOf(r){return r.title||r.citation||r.docket||`${labels[r.sourceSystem]||r.sourceSystem}资料`}
  function pair(label,value){if(value===null||value===undefined||String(value).trim()==='')return'';return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`}
  function analysisHtml(a){
    if(!a)return '<p class="muted">这条资料的中文裁判要旨/规则解析尚未生成。当前页面仅展示已经从官方来源采集的结构化信息，请先以官方原文为准。</p>';
    return `${a.chineseTitle?`<h3>${esc(a.chineseTitle)}</h3>`:''}<p><strong>要旨：</strong>${esc(a.summary||'')}</p><p><strong>法律问题：</strong>${esc(a.legalIssue||'')}</p><p><strong>裁判/规则：</strong>${esc(a.holdingOrRule||'')}</p><p><strong>影响范围：</strong>${esc(a.impact||'')}</p><p class="muted">${esc(a.disclaimer||'')}</p>`;
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
      document.title=`${title}｜美国判例与新规｜唐人日报`;
      const canonical=`https://trrb.net/legal/detail.html?id=${encodeURIComponent(recordId)}`;
      document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical);
      $('#detail-source').textContent=labels[r.sourceSystem]||r.sourceSystem||'资料详情';
      $('#detail-source-badge').textContent=labels[r.sourceSystem]||r.sourceSystem||'官方资料';
      $('#detail-type').textContent=r.authorityType||'法律资料';
      $('#detail-title').textContent=title;
      const meta=[r.issuingBody,displayDate(r.publicationDate),r.docket?`案号 ${r.docket}`:'',r.citation||''].filter(Boolean);
      $('#detail-meta').innerHTML=meta.map(v=>`<span>${esc(v)}</span>`).join('');
      $('#detail-analysis').innerHTML=analysisHtml(a);
      $('#detail-fields-list').innerHTML=[
        pair('来源系统',labels[r.sourceSystem]||r.sourceSystem),
        pair('发布机构',r.issuingBody),
        pair('资料类型',r.authorityType),
        pair('发布日期',displayDate(r.publicationDate)),
        pair('案号',r.docket),
        pair('正式引证',r.citation),
        pair('管辖范围',r.jurisdiction),
        pair('先例状态',r.precedentialStatus),
        pair('来源键',r.sourceKey),
        pair('数据库版本',db.datasetVersion)
      ].join('');
      const official=[];
      if(r.officialUrl)official.push(`<a class="primary" href="${esc(r.officialUrl)}" target="_blank" rel="noopener noreferrer" data-official-primary="true">打开官方原文</a>`);
      if(r.officialPdfUrl&&r.officialPdfUrl!==r.officialUrl)official.push(`<a href="${esc(r.officialPdfUrl)}" target="_blank" rel="noopener noreferrer" data-official-pdf="true">打开官方PDF</a>`);
      $('#detail-official-actions').innerHTML=official.join('')||'<span class="muted">当前记录没有可用的官方原文链接。</span>';
      $('#detail-status').hidden=true;
      $('#detail-record').hidden=false;
    }catch(e){fail(`暂时无法加载资料：${e.message}`)}
  }
  load();
})();
