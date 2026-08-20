#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file=process.argv[2];
if(!file){console.error('Usage: node scripts/immigration-judge-data-validator.mjs <dataset.json>');process.exit(2)}
const raw=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
const rows=Array.isArray(raw)?raw:(raw.rows||raw.results||[]);
const issues=[];const seen=new Map();
const n=v=>Number(v??0);const text=v=>String(v??'').trim();
for(let i=0;i<rows.length;i++){
 const r=rows[i],line=i+1,name=text(r.judge_name),court=text(r.court_name),g=n(r.grants),d=n(r.denials),o=n(r.other_decisions),t=n(r.total_asylum_decisions),fy=r.fiscal_year==null?null:n(r.fiscal_year),nat=text(r.nationality);
 const key=[name.toLowerCase(),court.toLowerCase(),fy??'',nat.toLowerCase()].join('|');
 if(!name)issues.push({line,severity:'error',code:'MISSING_JUDGE',message:'缺少法官姓名'});
 if(!court)issues.push({line,severity:'warning',code:'MISSING_COURT',message:'缺少法院'});
 if([g,d,o,t].some(x=>!Number.isFinite(x)||x<0))issues.push({line,severity:'error',code:'INVALID_COUNT',message:'裁决数量必须为非负数字'});
 if(t&&g+d+o>t)issues.push({line,severity:'error',code:'OUTCOME_GT_TOTAL',message:`批准+拒绝+其他(${g+d+o})大于总裁决(${t})`});
 if(fy!=null&&(fy<1980||fy>2100))issues.push({line,severity:'warning',code:'ODD_FISCAL_YEAR',message:`异常财政年度 ${fy}`});
 if(seen.has(key))issues.push({line,severity:'error',code:'DUPLICATE',message:`与第 ${seen.get(key)} 行重复`});else seen.set(key,line);
 if((g+d)>0&&(g/(g+d)*100<0||g/(g+d)*100>100))issues.push({line,severity:'error',code:'INVALID_RATE',message:'批准率超出0-100%'});
}
const errors=issues.filter(x=>x.severity==='error').length,warnings=issues.length-errors;
const report={generated_at:new Date().toISOString(),file:path.basename(file),rows:rows.length,errors,warnings,valid:errors===0,issues};
console.log(JSON.stringify(report,null,2));process.exit(errors?1:0);
