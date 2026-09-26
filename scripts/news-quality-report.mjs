import {inForwardScope} from './news-forward-policy.mjs';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {countChinese,deepQualityErrors,contentDigest} from './news-editorial-policy.mjs';
export const DEEP_SHARE_TARGET=0.30;
export function publicationQualityReport(rows,{now=Date.now(),windowDays=7}={}) {
  const groups={china_hot:{published:0,deep:0,over_2000:0},ice:{published:0,deep:0,over_2000:0}};
  const seen=new Set();
  for(const row of rows){
    const at=Date.parse(row.published_at),m=row.metadata||{};
    if(row.status!=='published'||row.visibility!=='public'||!Number.isFinite(at)||at>now||now-at>windowDays*86400000||seen.has(row.id))continue;
    const key=row.automation_source==='china-hot-li-teacher-v2'?'china_hot':m.event_fingerprint||m.ice_story_id||m.ice_story_uuid?'ice':null;
    if(!key)continue;seen.add(row.id);
    const group=groups[key],n=countChinese(row.content);group.published++;if(n>=2000)group.over_2000++;
    const core=['single_event','grounded','sufficient','source_chain_complete','analysis_grounded','depth_appropriate','court_status_correct'];
    if(m.editorial_depth==='deep' && m.reviewed_content_sha256===contentDigest(row.title,row.content)
      && core.every(k=>m.editorial_review?.[k]===true)
      && (m.editorial_review?.fresh_hot_event===true||m.editorial_review?.fresh_event===true)
      && deepQualityErrors({content:row.content,editorial_depth:'deep'},m.context_research,m.editorial_review).length===0)group.deep++;
  }
  const total=Object.values(groups).reduce((a,g)=>({published:a.published+g.published,deep:a.deep+g.deep,over_2000:a.over_2000+g.over_2000}),{published:0,deep:0,over_2000:0});
  for(const g of [...Object.values(groups),total])g.deep_share=g.published?Number((g.deep/g.published).toFixed(4)):null;
  return {event:'news-quality-seven-day',as_of:new Date(now).toISOString(),window_days:windowDays,deep_min:2000,deep_max:3500,deep_share_target:DEEP_SHARE_TARGET,target_is_publication_gate:false,daily_volume_goal:[100,200],groups,total};
}
export async function runQualityReport(){
  const now=Date.now(),base=String(process.env.SUPABASE_URL||'').replace(/\/$/,''),secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!secret)throw new Error('缺少新闻统计数据库配置');
  const rows=[];
  for(let offset=0;;offset+=500){
    if(offset>=20000)throw new Error('统计超过分页安全范围，禁止输出不完整占比');
    const query=new URLSearchParams({select:'id,title,content,status,visibility,created_at,published_at,automation_source,metadata',status:'eq.published',visibility:'eq.public',published_at:`gte.${new Date(now-7*86400000).toISOString()}`,order:'published_at.asc,id.asc',offset:String(offset),limit:'500'});
    const r=await fetch(`${base}/rest/v1/articles?${query}`,{headers:{apikey:secret,Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error(`新闻质量统计读取失败 ${r.status}`);const page=await r.json();rows.push(...page);if(page.length<500)break;
  }
  const report=publicationQualityReport(rows,{now});
  if(process.env.NEWS_FORWARD_ONLY_FROM)report.forward_only={since:process.env.NEWS_FORWARD_ONLY_FROM,...publicationQualityReport(rows.filter(inForwardScope),{now})};
  report.counting_note='统计发布流水线，不等同于前台栏目；>=2000字与通过独立复核的深度稿分别计数';
  console.log(JSON.stringify(report));
  const scope=report.forward_only || report;
  for(const [name,g] of Object.entries(scope.groups))if(g.published>=10&&g.deep===0)console.log(`::warning title=深度稿产出缺口::${name}: ${g.published}篇新增发布，合格深度稿0篇；检查news-depth-assignment和news-depth-outcome，不得凑字或降低审核。`);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## 新闻质量：滚动七天\n\n深度稿须2000—3500个中文字符且通过来源、数据及上下游复核；30%仅为观察目标，不影响单篇发布审核。旧稿更新不计新增。\n\n| 机器人 | 新增发布 | 合格深度稿 | 占比 |\n|---|---:|---:|---:|\n${Object.entries(report.groups).map(([name,g])=>`| ${name} | ${g.published} | ${g.deep} | ${g.deep_share===null?'无样本':(100*g.deep_share).toFixed(1)+'%'} |`).join('\n')}\n`);
  return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await runQualityReport();
