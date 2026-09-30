const {articleListQuery}=require('./article-search');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const lowerBound=n=>n.toString(16)+'0000000-0000-0000-0000-000000000000';
const timestamp=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:-Infinity;};
const compare=(a,b)=>timestamp(b.published_at)-timestamp(a.published_at)||timestamp(b.created_at)-timestamp(a.created_at)||String(b.id).localeCompare(String(a.id));

// Scan all 16 disjoint UUID ranges through the existing primary key. Each
// query is bounded, including Chinese two-character body searches. Do not
// impose a hidden date limit or return partial ranges as complete results.
async function partitionedSearch(input,spec,settings,rest){
 const original=articleListQuery(input,settings).query;
 const base={...spec.query,and:original.and,select:spec.pinnedOnly?'id,published_at,created_at,homepage_pinned_at':'id,published_at,created_at',order:'id.asc',limit:'1000'};
 delete base.offset;
 const matches=new Map();let next=0,stopped=false;
 const deadline=Date.now()+(settings.searchBudgetMs||16000);
 async function scan(part){
  const lower=lowerBound(part),upper=part<15?lowerBound(part+1):null;
  let cursor=null;
  for(;;){
   if(stopped||Date.now()>deadline)throw new Error('Bounded full-text search exceeded time budget');
   const q={...base,id:(cursor?'gt.':'gte.')+(cursor||lower)};
   const filters=[original.and?.slice(1,-1),upper?'id.lt.'+upper:null].filter(Boolean);
   q.and='('+filters.join(',')+')';
   const rows=await rest('articles',{query:q});
   if(!Array.isArray(rows))throw new Error('Invalid full-text range result');
   for(const row of rows){
    if(!UUID.test(row.id)||row.id.toLowerCase()<lower||(upper&&row.id.toLowerCase()>=upper)||(cursor&&row.id<=cursor)||matches.has(row.id))throw new Error('Search range returned repeated or out-of-range identifiers');
    matches.set(row.id,row);
   }
   if(rows.length<1000)return;
   cursor=rows.at(-1).id;
  }
 }
 async function worker(){while(next<16&&!stopped){const part=next++;try{await scan(part);}catch(error){stopped=true;throw error;}}}
 await Promise.all([worker(),worker()]);
 const all=[...matches.values()].sort((a,b)=>(spec.pinnedOnly?(timestamp(b.homepage_pinned_at)-timestamp(a.homepage_pinned_at)):0)||compare(a,b));
 const selected=all.slice(Number(spec.query.offset),Number(spec.query.offset)+spec.pageSize+1);
 if(!selected.length)return [];
 const q={...spec.query,and:original.and,id:'in.('+selected.map(r=>r.id).join(',')+')',offset:'0',limit:String(selected.length)};
 const details=await rest('articles',{query:q});
 if(!Array.isArray(details))throw new Error('Invalid search detail response');
 const byId=new Map(details.map(r=>[r.id,r]));
 // Recheck live status/visibility at detail fetch so concurrent withdrawals
 // disappear rather than expose private records from an earlier ID pass.
 return selected.map(r=>byId.get(r.id)).filter(Boolean);
}
module.exports={partitionedSearch,compare,lowerBound};
