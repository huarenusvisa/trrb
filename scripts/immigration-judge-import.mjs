#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input=process.argv[2];
if(!input){console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/immigration-judge-import.mjs <normalized.json>');process.exit(2)}
const SUPABASE_URL=process.env.SUPABASE_URL||'https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!KEY){console.error('Missing SUPABASE_SERVICE_ROLE_KEY');process.exit(2)}
const filePath=path.resolve(input);const fileBuffer=fs.readFileSync(filePath);const parsed=JSON.parse(fileBuffer.toString('utf8'));const rows=Array.isArray(parsed)?parsed:(parsed.rows||[]);
const sourceName=process.env.IMPORT_SOURCE_NAME||parsed.source_name||'EOIR/FOIA';
const sourceUrl=process.env.IMPORT_SOURCE_URL||parsed.source_url||null;
const sourceDate=process.env.IMPORT_SOURCE_DATE||parsed.source_date||null;
const sha256=crypto.createHash('sha256').update(fileBuffer).digest('hex');
const headers={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
async function req(table,{method='GET',query={},body,prefer}={}){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);for(const[k,v]of Object.entries(query))if(v!=null)u.searchParams.set(k,String(v));const h={...headers};if(prefer)h.Prefer=prefer;const r=await fetch(u,{method,headers:h,body:body==null?undefined:JSON.stringify(body)});const text=await r.text();if(!r.ok)throw new Error(`${table} ${r.status}: ${text.slice(0,500)}`);return text?JSON.parse(text):null}
const num=v=>Number(v||0),clean=v=>String(v??'').trim();
function validate(r,i){const issues=[];const g=num(r.grants),d=num(r.denials),o=num(r.other_decisions),t=num(r.total_asylum_decisions);if(!clean(r.judge_name))issues.push(['error','MISSING_JUDGE','缺少法官姓名']);if(!clean(r.court_name))issues.push(['warning','MISSING_COURT','缺少法院']);if([g,d,o,t].some(x=>!Number.isFinite(x)||x<0))issues.push(['error','INVALID_COUNT','裁决数量必须为非负数字']);if(t&&g+d+o>t)issues.push(['error','OUTCOME_GT_TOTAL','批准+拒绝+其他大于总裁决']);return issues.map(([severity,issue_code,message])=>({row_number:i+1,severity,issue_code,message,row_payload:r}))}
let issues=[];rows.forEach((r,i)=>issues.push(...validate(r,i)));const errors=issues.filter(x=>x.severity==='error');
const [batch]=await req('immigration_judge_import_batches',{method:'POST',body:{source_name:sourceName,source_url:sourceUrl,source_date:sourceDate,source_sha256:sha256,status:errors.length?'rejected':'validated',input_rows:rows.length,rejected_rows:errors.length?new Set(errors.map(x=>x.row_number)).size:0,warning_rows:new Set(issues.filter(x=>x.severity==='warning').map(x=>x.row_number)).size,notes:`file=${path.basename(filePath)}`}});
if(issues.length)await req('immigration_judge_import_issues',{method:'POST',body:issues.map(x=>({...x,batch_id:batch.id})),prefer:'return=minimal'});
if(errors.length){console.error(JSON.stringify({batch_id:batch.id,status:'rejected',errors:errors.length},null,2));process.exit(1)}
const judgeMap=new Map();let accepted=0;
for(const r of rows){const key=`${clean(r.judge_name_normalized||r.judge_name).toLowerCase()}|${clean(r.court_name).toLowerCase()}`;let judgeId=judgeMap.get(key);if(!judgeId){const g=num(r.grants),d=num(r.denials),t=num(r.total_asylum_decisions),adj=g+d;const payload={judge_name:clean(r.judge_name),judge_name_normalized:clean(r.judge_name_normalized||r.judge_name).toLowerCase(),court_name:clean(r.court_name)||null,court_city:clean(r.court_city)||null,court_state:clean(r.court_state)||null,total_asylum_decisions:t,grants:g,denials:d,other_decisions:num(r.other_decisions),approval_rate:adj?g/adj*100:null,denial_rate:adj?d/adj*100:null,data_start_date:r.data_start_date||null,data_end_date:r.data_end_date||null,source:clean(r.source)||sourceName,source_updated_at:r.source_updated_at||null,import_batch_id:batch.id,updated_at:new Date().toISOString()};const found=await req('immigration_judges',{query:{select:'id',judge_name_normalized:`eq.${payload.judge_name_normalized}`,court_name:`eq.${payload.court_name}`,limit:1}});if(found?.[0]?.id){judgeId=found[0].id;await req('immigration_judges',{method:'PATCH',query:{id:`eq.${judgeId}`},body:payload,prefer:'return=minimal'})}else{const created=await req('immigration_judges',{method:'POST',body:payload});judgeId=created[0].id}judgeMap.set(key,judgeId)}
 const g=num(r.grants),d=num(r.denials),adj=g+d,base={judge_id:judgeId,total_asylum_decisions:num(r.total_asylum_decisions),grants:g,denials:d,other_decisions:num(r.other_decisions),approval_rate:adj?g/adj*100:null,denial_rate:adj?d/adj*100:null,import_batch_id:batch.id,updated_at:new Date().toISOString()};
 if(r.fiscal_year!=null)await req('immigration_judge_asylum_yearly',{method:'POST',query:{on_conflict:'judge_id,fiscal_year'},body:{...base,fiscal_year:Number(r.fiscal_year)},prefer:'resolution=merge-duplicates,return=minimal'});
 if(clean(r.nationality))await req('immigration_judge_asylum_nationality',{method:'POST',query:{on_conflict:'judge_id,nationality'},body:{...base,nationality:clean(r.nationality),nationality_code:clean(r.nationality_code)||null,data_start_date:r.data_start_date||null,data_end_date:r.data_end_date||null},prefer:'resolution=merge-duplicates,return=minimal'});
 accepted++;
}
await req('immigration_judge_import_batches',{method:'PATCH',query:{id:`eq.${batch.id}`},body:{status:'imported',accepted_rows:accepted,rejected_rows:0,completed_at:new Date().toISOString()},prefer:'return=minimal'});
console.log(JSON.stringify({batch_id:batch.id,status:'imported',accepted_rows:accepted,sha256},null,2));
