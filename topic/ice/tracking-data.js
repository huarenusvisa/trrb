(function(root){
  'use strict';
  const aggregate = /日均|平均每天|平均每日|累计|累計|财年|財年|年度|历年|歷年|annual|daily average|per day|fiscal year/i;
  const clean = value => String(value || '').trim();
  function metadata(row) {try{return typeof row.metadata==='string'?JSON.parse(row.metadata):row.metadata||{};}catch{return {};}}
  function normalizeRow(row) {
    const meta=metadata(row);
    const extractor = typeof module!=='undefined' && module.exports ? require('./people-count.js') : root.TRRBIcePeople;
    const extracted = extractor.extractPeopleCount(row);
    const values=[meta.people_count,meta.detained_count,meta.arrested_count,meta.removed_count,row.arrest_count].map(Number).filter(n=>Number.isFinite(n)&&n>0&&n<=10000000);
    const isAggregate=aggregate.test(row.title||'') || ['annual','cumulative','daily_average'].includes(meta.count_scope);
    const people=isAggregate?0:(values.length?Math.max(...values):extracted.value||0);
    const kind=isAggregate?'excluded':meta.people_count_type || (meta.people_count_estimated||meta.estimated_count?'estimated':extracted.kind||'unknown');
    return {...row,people,people_count_type:kind,estimated:kind==='estimated',aggregate_statistic:isAggregate,
      time:row.published_at||row.time||row.created_at,
      location:clean(meta.location_text||meta.location||[meta.city||row.city,meta.state_code||row.state].filter(Boolean).join(', ')),
      event_key:meta.event_id||meta.event_key||'',source_url:clean(row.source_url)};
  }
  function sourceKey(row) {
    if(row.event_key)return clean(row.event_key);
    try { const url=new URL(row.source_url);
      for(const key of [...url.searchParams.keys()])if(/^utm_|^(s|t|fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
      url.hash='';
      if(/^\/(?:news|newsroom|press-releases)?\/?$/.test(url.pathname)&&!url.search)return '';
      return url.href;
    } catch{return '';}
  }
  function dedupe(rows) {
    const ids=new Set(), events=new Set(), titles=new Set();
    return rows.filter(row=>{
      const id=clean(row.id), event=sourceKey(row), title=clean(row.title).replace(/[\s\p{P}]/gu,'').toLowerCase();
      if(id&&ids.has(id)||event&&events.has(event)||title&&titles.has(title))return false;
      if(id)ids.add(id);if(event)events.add(event);if(title)titles.add(title);return true;
    });
  }
  function summarize(rows,hours=24,now=Date.now()) {
    const items=dedupe(rows).filter(row=>{const age=now-Date.parse(row.time||row.published_at||row.created_at);return age>=0&&age<=hours*3600000;});
    const places=new Set();let exact=0,estimated=0,unknown=0,excluded=0;
    for(const row of items){if(row.location)places.add(row.location);if(row.aggregate_statistic){excluded++;continue;}if(row.people>0){if(row.estimated)estimated+=row.people;else exact+=row.people;}else unknown++;}
    return {reports:items.length,people:exact+estimated,exact,estimated,unknown,excluded,places:places.size,latest:items[0]?.time||null};
  }
  async function fetchRecent(hours=24){
    const rows=[];const base='https://fwiznbpsqkfgkvyznebz.supabase.co';const key='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
    for(let offset=0;offset<5000;offset+=500){
      const url=new URL(base+'/rest/v1/articles');
      Object.entries({select:'id,title,summary,content,metadata,arrest_count,city,state,source_url,published_at,created_at',status:'eq.published',visibility:'eq.public',topic_key:'eq.ice',published_at:'gte.'+new Date(Date.now()-hours*3600000).toISOString(),order:'published_at.desc,id.desc',limit:'500',offset:String(offset)}).forEach(([k,v])=>url.searchParams.set(k,v));
      const response=await fetch(url,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('ICE data '+response.status);const page=await response.json();rows.push(...page.map(normalizeRow));if(page.length<500)return dedupe(rows);
    }
    throw new Error('ICE data range exceeds display limit');
  }
  const api={normalizeRow,dedupe,summarize,fetchRecent};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.TRRBIceData=api;
})(globalThis);
