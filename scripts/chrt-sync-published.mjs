// One-time repair of already-published records; no collection, AI calls or deletion.
import {supabase, buildChrtRecord} from './china-hot-li-teacher-ingest.mjs';
import {readAllPages} from './paged-read.mjs';

const hours = Number(process.env.CHRT_SYNC_LOOKBACK_HOURS || 72);
if (!Number.isInteger(hours) || hours < 6 || hours > 672) throw new Error('CHRT repair window must be 6–672 hours');
const rows = await readAllPages(page => supabase('articles', {query:{
  select:'id,title,summary,content,category_name,source_url,source_account,source_platform,source_post_id,source_created_at,created_at,primary_section,topic_key,metadata',
  automation_source:'eq.china-hot-li-teacher-v2',status:'eq.published',visibility:'eq.public',
  created_at:`gte.${new Date(Date.now()-hours*3600000).toISOString()}`,
  order:'created_at.asc,id.asc',...page,
}}), {pageSize:100,maxRows:5000});
const records=rows.filter(row=>row.topic_key!=='ren-zhengfei').map(buildChrtRecord);
if(!records.length){console.log(JSON.stringify({received:0,inserted:0}));process.exit(0);}
const oidcUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
oidcUrl.searchParams.set('audience','https://chinahumanrightstracker.org');
const identity=await fetch(oidcUrl,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(30000)});
if(!identity.ok)throw new Error(`OIDC: ${identity.status}`);
const {value:token}=await identity.json();
if(!token)throw new Error('Missing OIDC identity');
const total={received:0,inserted:0,duplicates:0,rejected:0,removed:0};
for(let offset=0;offset<records.length;offset+=40){
  const batch=records.slice(offset,offset+40);
  const response=await fetch('https://chinahumanrightstracker.org/api/ingest/trrb',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({records:batch,syncMode:'upsert'}),signal:AbortSignal.timeout(45000),
  });
  if(!response.ok)throw new Error(`CHRT: ${response.status} ${(await response.text()).slice(0,500)}`);
  const result=await response.json();
  if(result.ok!==true||result.received!==batch.length)throw new Error('Invalid CHRT receipt');
  for(const key of Object.keys(total))total[key]+=Number(result[key])||0;
  console.log(JSON.stringify({offset,...result}));
}
console.log(JSON.stringify({event:'chrt-published-recovery',lookbackHours:hours,...total}));
