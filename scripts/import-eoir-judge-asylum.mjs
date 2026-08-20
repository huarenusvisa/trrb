#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const file=process.argv[2];
if(!file){console.error('Usage: node scripts/import-eoir-judge-asylum.mjs <csv-or-json>');process.exit(1)}
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
if(!SUPABASE_URL||!KEY){console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');process.exit(1)}

const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const pct=v=>{const s=clean(v).replace('%','');const n=Number(s);return Number.isFinite(n)?n:null};
const normName=v=>clean(v).toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ,.'-]/g,'');
const pick=(r,keys)=>{for(const k of keys){if(r[k]!=null&&clean(r[k])!=='')return r[k]}return''};

function parseCsv(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(q){if(c==='"'&&n==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c;continue}
    if(c==='"'){q=true;continue}
    if(c===','){row.push(cell);cell='';continue}
    if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';continue}
    cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  const headers=(rows.shift()||[]).map(x=>clean(x));
  return rows.filter(r=>r.some(x=>clean(x))).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

async function loadRows(file){
  const text=await fs.readFile(file,'utf8');
  if(path.extname(file).toLowerCase()==='.json'){
    const j=JSON.parse(text);return Array.isArray(j)?j:(Array.isArray(j.rows)?j.rows:[]);
  }
  return parseCsv(text);
}

async function rest(table,{method='GET',query='',body}={}){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${table}${query?`?${query}`:''}`,{
    method,headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},
    body:body?JSON.stringify(body):undefined
  });
  if(!res.ok)throw new Error(`${table} ${res.status}: ${await res.text()}`);
  const t=await res.text();return t?JSON.parse(t):[];
}

const raw=await loadRows(file);
const judges=new Map();
const yearly=[];const nationality=[];
for(const r of raw){
  const judge=clean(pick(r,['judge_name','Judge','Immigration Judge','IJ','Judge Name']));
  if(!judge)continue;
  const court=clean(pick(r,['court_name','Court','Immigration Court','Court Name']));
  const city=clean(pick(r,['court_city','City','Court City']));
  const state=clean(pick(r,['court_state','State','Court State']));
  const grants=num(pick(r,['grants','Grant','Grants','Granted']));
  const denials=num(pick(r,['denials','Denial','Denials','Denied']));
  const other=num(pick(r,['other_decisions','Other','Others']));
  let total=num(pick(r,['total_asylum_decisions','Total','Decisions','Total Decisions']));
  if(!total)total=grants+denials+other;
  const approval=pct(pick(r,['approval_rate','Approval Rate','Grant Rate','Granted %'])) ?? ((grants+denials)>0?grants/(grants+denials)*100:null);
  const key=`${normName(judge)}|${court}`;
  if(!judges.has(key))judges.set(key,{judge_name:judge,judge_name_normalized:normName(judge),court_name:court||null,court_city:city||null,court_state:state||null,total_asylum_decisions:0,grants:0,denials:0,other_decisions:0,approval_rate:null,denial_rate:null,source:'EOIR',source_updated_at:new Date().toISOString()});
  const j=judges.get(key);j.total_asylum_decisions+=total;j.grants+=grants;j.denials+=denials;j.other_decisions+=other;
  const fy=num(pick(r,['fiscal_year','Fiscal Year','FY','Year']));
  const nat=clean(pick(r,['nationality','Nationality','Country','Citizenship']));
  if(fy)yearly.push({key,fiscal_year:fy,total_asylum_decisions:total,grants,denials,other_decisions:other,approval_rate:approval});
  if(nat)nationality.push({key,nationality:nat,nationality_code:clean(pick(r,['nationality_code','Country Code']))||null,total_asylum_decisions:total,grants,denials,other_decisions:other,approval_rate:approval});
}
for(const j of judges.values()){
  const d=j.grants+j.denials;j.approval_rate=d?j.grants/d*100:null;j.denial_rate=d?j.denials/d*100:null;
}
const upserted=await rest('immigration_judges',{method:'POST',query:'on_conflict=judge_name_normalized,court_name',body:[...judges.values()]});
const ids=new Map(upserted.map(j=>[`${j.judge_name_normalized}|${j.court_name||''}`,j.id]));
if(yearly.length){
  const payload=yearly.map(x=>({judge_id:ids.get(x.key),fiscal_year:x.fiscal_year,total_asylum_decisions:x.total_asylum_decisions,grants:x.grants,denials:x.denials,other_decisions:x.other_decisions,approval_rate:x.approval_rate})).filter(x=>x.judge_id);
  if(payload.length)await rest('immigration_judge_asylum_yearly',{method:'POST',query:'on_conflict=judge_id,fiscal_year',body:payload});
}
if(nationality.length){
  const payload=nationality.map(x=>({judge_id:ids.get(x.key),nationality:x.nationality,nationality_code:x.nationality_code,total_asylum_decisions:x.total_asylum_decisions,grants:x.grants,denials:x.denials,other_decisions:x.other_decisions,approval_rate:x.approval_rate})).filter(x=>x.judge_id);
  if(payload.length)await rest('immigration_judge_asylum_nationality',{method:'POST',query:'on_conflict=judge_id,nationality',body:payload});
}
console.log(JSON.stringify({source:file,input_rows:raw.length,judges:judges.size,yearly_rows:yearly.length,nationality_rows:nationality.length},null,2));
