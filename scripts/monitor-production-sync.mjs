#!/usr/bin/env node
/**
 * TRRB production parity check. A failing run produces the repository's
 * existing GitHub Actions failure email (subject: Run failed).
 * Source of truth: GitHub main, Supabase published articles, Netlify live.
 */
const SITE = 'https://trrb.net';
const PROJECT = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const MAX_LAG = 20 * 60_000;
const NOW = Date.now();
const failures = [];
const outcomes = [];
const snooze = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, {headers={}, expectText=false, timeout=16000}={}) {
  let last;
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {'Cache-Control':'no-cache',...headers},
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error('HTTP '+response.status+' for '+new URL(url).pathname);
      if(expectText) return await response.text();
      return await response.json();
    } catch(error) { last=error; if(attempt<2) await snooze(600*(attempt+1)); }
  }
  throw last;
}

async function verifySite() {
  const markup = await request(SITE+'/taiwan-strait-2026/?monitor='+NOW,{expectText:true});
  const feature = await request(SITE+'/?monitor='+NOW,{expectText:true});
  const cover = '/assets/topic-focus/taiwan-strait-2026-map.jpg';
  if (!markup.includes(cover)) failures.push('专题内页缺少已指定的台海封面');
  if (!feature.includes(cover)) failures.push('首页专题卡片缺少已指定的台海封面');
  for (const path of [cover, '/assets/news/sea-launch-2113116395353551055.jpg']) {
    try {
      const response = await fetch(SITE+path+'?monitor='+NOW,{signal:AbortSignal.timeout(16000)});
      if (response.status !== 200 || !String(response.headers.get('content-type')||'').startsWith('image/')) {
        failures.push('图片资源不可访问: '+path+' / HTTP '+response.status);
      } else outcomes.push('图片正常: '+path);
      await response.body?.cancel();
    } catch(e) { failures.push('图片请求失败 '+path+': '+String(e.message||e)); }
  }
}

async function verifyDeployment() {
  const repo = process.env.GITHUB_REPOSITORY || 'huarenusvisa/trrb';
  const token = process.env.GITHUB_TOKEN || '';
  const endpoint = 'https://api.github.com/repos/'+repo+'/commits/main';
  const remote = await request(endpoint,{headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})}});
  const sha = String(remote.sha||'');
  const commitDate = Date.parse(remote.commit?.committer?.date||remote.commit?.author?.date||'');
  const live = (await request(SITE+'/deploy-version.txt?monitor='+NOW,{expectText:true})).trim();
  outcomes.push('GitHub='+sha.slice(0,12)+'; Netlify='+live.slice(0,12));
  if (sha && Number.isFinite(commitDate) && NOW-commitDate > MAX_LAG && live !== sha) {
    failures.push('GitHub main 已更新超过20分钟，但Netlify版本号不一致');
  }
}

async function verifyNews() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error('缺少 GitHub Actions Secret: SUPABASE_SERVICE_ROLE_KEY');
  const headers = {apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
  const live=await request(SITE+'/.netlify/functions/public-home-bundle?limit=200&per_category=20&monitor='+NOW);
  if(live.mode!=='homepage'||!Array.isArray(live.articles)) throw new Error('首页新闻服务无有效文章数据');
  const liveIds = new Set(live.articles.map(row=>String(row.id)));
  for(const category of ['中国热门头条','中国政治']){
    const query = new URL(PROJECT+'/rest/v1/articles');
    for (const [name,value] of Object.entries({
       select:'id,title,published_at,category_name',
       category_name:'eq.'+category,
       status:'eq.published',
       visibility:'eq.public',
       published_at:'gte.'+new Date(NOW-96*3600_000).toISOString(),
       order:'published_at.desc',
       limit:'4',
    })) query.searchParams.set(name,value);
    const rows=await request(query.href,{headers});
    const mature=rows.filter(x=>NOW-Date.parse(x.published_at)>MAX_LAG);
    if (!mature.length) {
      outcomes.push(category+': 近期无已超过20分钟的合格新稿，跳过落后判定');
      continue;
    }
    const newest=mature[0];
    outcomes.push(category+': 最新检查 '+newest.id+' / '+newest.title.slice(0,40));
    if(!liveIds.has(String(newest.id))) {
      failures.push(category+'：最新已发布文章超过20分钟仍未进入首页接口：'+newest.id);
    }
  }
  const focusId='971f99c1-8d31-4407-bca7-7737fa789d2e';
  const leadUrl=SITE+'/hot-headlines/taiwan-sea-launch-video-2113116395353551055';
  const html=await request(leadUrl+'?monitor='+NOW,{expectText:true});
  if(!html.includes('网传海上导弹发射画面')) failures.push('海上发射新闻正文页面未返回预期标题');
  outcomes.push('海上发射新闻路由已检查：'+focusId);
}

for (const [name,fn] of [['网页与配图',verifySite],['GitHub→Netlify',verifyDeployment],['数据库→首页新闻',verifyNews]]) {
 try {await fn()} catch(e) { failures.push(name+'检查失败：'+String(e.message||e));}
}
console.log('TRRB 同步检查 / '+new Date().toISOString());
for(const x of outcomes) console.log('OK '+x);
for(const f of failures) console.error('ALERT '+f);
if(failures.length){
 console.error('检测到 '+failures.length+' 项问题；GitHub Actions将标记为失败并按账户通知偏好发送通知。');
 process.exitCode=1;
} else {
 console.log('通过：没有发现超时部署、新闻不同步或指定专题图片缺失。');
}
