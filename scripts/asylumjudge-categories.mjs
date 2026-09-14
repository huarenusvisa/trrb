import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const STATE_NAMES = {
  AL:['Alabama','阿拉巴马州'],AK:['Alaska','阿拉斯加州'],AZ:['Arizona','亚利桑那州'],AR:['Arkansas','阿肯色州'],
  CA:['California','加利福尼亚州'],CO:['Colorado','科罗拉多州'],CT:['Connecticut','康涅狄格州'],DE:['Delaware','特拉华州'],
  DC:['District of Columbia','哥伦比亚特区'],FL:['Florida','佛罗里达州'],GA:['Georgia','佐治亚州'],GU:['Guam','关岛'],
  HI:['Hawaii','夏威夷州'],ID:['Idaho','爱达荷州'],IL:['Illinois','伊利诺伊州'],IN:['Indiana','印第安纳州'],
  IA:['Iowa','艾奥瓦州'],KS:['Kansas','堪萨斯州'],KY:['Kentucky','肯塔基州'],LA:['Louisiana','路易斯安那州'],
  ME:['Maine','缅因州'],MD:['Maryland','马里兰州'],MA:['Massachusetts','马萨诸塞州'],MI:['Michigan','密歇根州'],
  MN:['Minnesota','明尼苏达州'],MS:['Mississippi','密西西比州'],MO:['Missouri','密苏里州'],MT:['Montana','蒙大拿州'],
  NE:['Nebraska','内布拉斯加州'],NV:['Nevada','内华达州'],NH:['New Hampshire','新罕布什尔州'],NJ:['New Jersey','新泽西州'],
  NM:['New Mexico','新墨西哥州'],NY:['New York','纽约州'],NC:['North Carolina','北卡罗来纳州'],ND:['North Dakota','北达科他州'],
  MP:['Northern Mariana Islands','北马里亚纳群岛'],OH:['Ohio','俄亥俄州'],OK:['Oklahoma','俄克拉何马州'],OR:['Oregon','俄勒冈州'],
  PA:['Pennsylvania','宾夕法尼亚州'],PR:['Puerto Rico','波多黎各'],RI:['Rhode Island','罗得岛州'],SC:['South Carolina','南卡罗来纳州'],
  SD:['South Dakota','南达科他州'],TN:['Tennessee','田纳西州'],TX:['Texas','得克萨斯州'],UT:['Utah','犹他州'],
  VT:['Vermont','佛蒙特州'],VA:['Virginia','弗吉尼亚州'],WA:['Washington','华盛顿州'],WV:['West Virginia','西弗吉尼亚州'],
  WI:['Wisconsin','威斯康星州'],WY:['Wyoming','怀俄明州']
};
export const stateSlug = code => STATE_NAMES[code]?.[0].toLowerCase().replace(/[^a-z0-9]+/g,'-');
const e = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const n = value => Number(value || 0);
export const sample = row => n(row.grants) + n(row.denials);
export const approvalRate = row => sample(row) ? n(row.grants) / sample(row) * 100 : null;
const fmt = value => n(value).toLocaleString('en-US');
const pct = row => sample(row) < 50 ? '—' : approvalRate(row).toFixed(1) + '%';
export const profileNameKey = value => {
  const name = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(?:jr|sr|ii|iii|iv)\.?\b/gi,'').replace(/[^a-zA-Z,' -]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  if (name.includes(',')) { const [last, first] = name.split(',',2); return last.trim() + '|' + first.trim().split(/\s+/)[0]; }
  const parts = name.split(/\s+/); return parts.length > 1 ? parts.at(-1) + '|' + parts[0] : name;
};

export function aggregateAnnualProfiles(profiles, judges) {
  const groups = new Map();
  for (const judge of judges) {
    const key = profileNameKey(judge.judge_name);
    groups.set(key, [...(groups.get(key) || []), judge]);
  }
  const sourceCounts = new Map();
  for (const profile of profiles) sourceCounts.set(profile.name_key, (sourceCounts.get(profile.name_key) || 0) + 1);
  const results = [];
  profileLoop: for (const profile of profiles) {
    const matches = groups.get(profile.name_key) || [];
    // A short name key is insufficient evidence when more than one profile matches.
    if (matches.length !== 1 || sourceCounts.get(profile.name_key) !== 1) continue;
    const periods = new Map();
    const seen = new Set();
    for (const row of profile.rows || []) {
      const year = Number(row.fiscal_year);
      if (!Number.isInteger(year)) throw new Error('Invalid category fiscal year');
      const identity = year + ':' + (row.nationality_code || row.nationality);
      if (seen.has(identity)) continue profileLoop; // Ambiguous source grouping: exclude the entire profile.
      seen.add(identity);
      const period = periods.get(year) || { fiscal_year:year, grants:0, denials:0, other_decisions:0, total_asylum_decisions:0 };
      for (const field of ['grants','denials','other_decisions','total_asylum_decisions']) {
        const value = Number(row[field]);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid category outcome count');
        period[field] += value;
      }
      if (n(row.total_asylum_decisions) !== n(row.grants) + n(row.denials) + n(row.other_decisions)) throw new Error('Category source outcomes do not reconcile');
      periods.set(year, period);
    }
    for (const period of periods.values()) results.push({ ...matches[0], ...period });
  }
  return results;
}

export function eligibleJudges(rows, year, minimum = 100) {
  return rows.filter(row => row.fiscal_year === year && sample(row) >= minimum)
    .sort((a,b) => approvalRate(b) - approvalRate(a) || sample(b) - sample(a) || a.judge_name.localeCompare(b.judge_name));
}

export async function buildAsylumJudgeCategories({ root, output, judgeData, courtData, slugify, shortId }) {
  const source = JSON.parse(await readFile(join(root,'data/immigration-judge-state-periods.json'),'utf8'));
  const index = JSON.parse(await readFile(join(root,'data/immigration-judge-nationality-yearly.json'),'utf8'));
  if (source.source_snapshot_date !== index.source_snapshot_date || source.scope_end !== index.scope_end) throw new Error('Category sources must share a snapshot');
  const shards = await Promise.all(index.shards.map(async file => JSON.parse(await readFile(join(root,'data',file),'utf8'))));
  const profiles = shards.flatMap(shard => shard.profiles || []);
  if (shards.some(shard => !shard.profiles?.length)) throw new Error('Missing category annual shard');
  // The legacy index profile_count includes records absent from the published shards.
  // Verify coverage against independent national outcome totals instead.
  for (const national of source.national) {
    const rows = profiles.flatMap(profile => profile.rows || []).filter(row => row.fiscal_year === national.fiscal_year);
    const covered = rows.reduce((sum,row)=>sum+sample(row),0);
    if (covered > sample(national) || covered < sample(national)*0.99) throw new Error('Incomplete or duplicate annual category coverage for FY '+national.fiscal_year);
  }
  const years = source.years.map(Number).filter(year => year >= source.latest_fiscal_year - 2).sort((a,b)=>b-a);
  const completeYear = years.find(year => year < source.latest_fiscal_year && (year-1) + '-10-01' >= source.scope_start);
  if (!completeYear || years.length < 2) throw new Error('Categories require a complete comparison year');
  const annual = aggregateAnnualProfiles(profiles,judgeData.results);
  if (eligibleJudges(annual,completeYear).length < 20) throw new Error('Insufficient matched annual judge data');
  const courtRoutes = new Map(courtData.courts.map(court => [court.court_name,'courts/' + slugify(court.court_name) + '--' + String(court.court_code || slugify(court.court_state)).toLowerCase()]));
  const courtStates = new Map(source.courts.map(court => [court.court_name,court.state]));
  const catalog = judgeData.results.map(judge => ({...judge, directory_state:courtStates.get(judge.court_name) || judge.court_state}));
  const sitemapRows = [];
  const added = [];
  const selectedStates = ['CA','NY','TX','FL','VA','MD'].filter(code=>source.states.some(row=>row.state===code));
  for (const language of ['zh-Hans','en']) {
    const en = language === 'en';
    const prefix = en ? '/en' : '';
    const text = (english,chinese) => en ? english : chinese;
    const path = route => prefix + '/' + (route ? route.replace(/^\/|\/$/g,'') + '/' : '');
    const stateName = code => STATE_NAMES[code]?.[en ? 0 : 1] || code;
    const statePath = code => path('states/' + stateSlug(code));
    const judgePath = judge => path('judges/' + slugify(judge.judge_name) + '--' + shortId(judge.id));
    const periodLabel = year => 'FY ' + year + ' · ' + (year-1) + '-10-01 – ' + (year===source.latest_fiscal_year ? source.scope_end : year+'-09-30') + ' · ' + (year===source.latest_fiscal_year ? text('Year to date','财年至今') : text('Complete fiscal year','完整财年'));
    const intro = text('Asylum grants ÷ (grants + denials). Other outcomes are excluded from this rate. Historical statistics do not predict an individual case.',
      '庇护批准数 ÷（批准数 + 拒绝数）。其他结案结果不计入这个比例。历史统计不能预测个案结果。');
    const tabs = defaultYear => '<nav class="category-years" aria-label="'+text('Fiscal year','财政年度')+'">'+years.map(year=>'<a href="#fy-'+year+'" data-category-year="'+year+'"'+(year===defaultYear?' aria-current="true"':'')+'>FY '+year+(year===source.latest_fiscal_year?' · '+text('YTD','累计'):'')+'</a>').join('')+'</nav>';
    const table = (headers,body,attributes='') => '<div class="category-table-scroll"><table '+attributes+'><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
    const cell = content => '<td>'+content+'</td>';
    const metricHeaders = [text('Decisions','结案总数'),text('Granted','批准'),text('Denied','拒绝'),text('Other','其他'),text('Approval rate','通过率')];
    const metrics = row => ['total_asylum_decisions','grants','denials','other_decisions'].map(key=>cell(fmt(row[key]))).join('')+cell(pct(row));
    const snapshotNote = text('Data snapshot: ','数据快照：') + source.source_snapshot_date;
    const page = (route,title,description,body,defaultYear=source.latest_fiscal_year) => {
      const url = 'https://asylumjudge.com'+path(route);
      const other = (en?'':'/en')+'/'+route+'/';
      const crumbs = [{ '@type':'ListItem',position:1,name:'AsylumJudge',item:'https://asylumjudge.com'+path('') }];
      if (route.startsWith('states/')) crumbs.push({'@type':'ListItem',position:2,name:text('States','各州数据'),item:'https://asylumjudge.com'+path('states')});
      crumbs.push({'@type':'ListItem',position:crumbs.length+1,name:title,item:url});
      const schema = {'@context':'https://schema.org','@graph':[
        {'@type':'WebPage','@id':url+'#webpage',url,name:title,description,inLanguage:language},
        {'@type':'BreadcrumbList',itemListElement:crumbs}
      ]};
      return '<!doctype html><html lang="'+language+'"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
        '<title>'+e(title)+' | AsylumJudge</title><meta name="description" content="'+e(description)+'"><meta name="robots" content="index,follow,max-image-preview:large">'+
        '<link rel="canonical" href="'+url+'"><link rel="alternate" hreflang="en" href="https://asylumjudge.com/en/'+route+'/"><link rel="alternate" hreflang="zh-Hans" href="https://asylumjudge.com/'+route+'/"><link rel="alternate" hreflang="x-default" href="https://asylumjudge.com/'+route+'/">'+
        '<meta property="og:title" content="'+e(title)+'"><meta property="og:description" content="'+e(description)+'"><meta property="og:url" content="'+url+'"><meta property="og:image" content="https://asylumjudge.com/asylumjudge/og-logo.png">'+
        '<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/asylumjudge/categories.css?v=1"><script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script></head>'+
        '<body data-category-page data-default-year="'+defaultYear+'"><a class="category-skip" href="#main">'+text('Skip to content','跳到正文')+'</a>'+
        '<header class="category-header"><a href="'+path('')+'"><img src="/asylumjudge/logo.svg" alt="AsylumJudge.com" width="220" height="52"></a>'+
        '<nav aria-label="'+text('Main navigation','主要导航')+'"><a href="'+path('')+'">'+text('Find judges','查法官')+'</a><a href="'+path('states')+'">'+text('By state','按州查询')+'</a><a href="'+path('courts')+'">'+text('Courts','查法院')+'</a><a href="'+path('judge-approval-rates')+'">'+text('Approval rate comparison','通过率比较')+'</a><a href="'+path('compare')+'">'+text('Compare judges','法官对比')+'</a><a href="'+other+'" lang="'+(en?'zh-Hans':'en')+'">'+(en?'简体中文':'English')+'</a></nav></header>'+
        '<main id="main" class="category-main"><p class="category-breadcrumb"><a href="'+path('')+'">AsylumJudge</a> / <a href="'+path('states')+'">'+text('States and territories','各州及地区')+'</a></p>'+
        '<h1>'+e(title)+'</h1><p class="category-lead">'+e(description)+'</p><p class="category-source">'+snapshotNote+'</p>'+body+
        '<section class="category-method"><h2>'+text('How to read these rates','如何理解通过率')+'</h2><p>'+intro+'</p><p>'+text('State totals follow the court at decision time, not the applicant’s home address. Small samples below 50 grants and denials show no rate. Judge comparison requires at least 100.',
        '州统计按案件裁决当时的法院归属，不代表申请人居住地。批准与拒绝合计不足50件不显示比例；法官比较至少需要100件。')+'</p><a href="/methodology/">'+text('Data sources and methodology (Chinese)','数据来源与统计口径')+'</a></section></main>'+
        '<footer class="category-footer">AsylumJudge.com · '+snapshotNote+'</footer><script src="/asylumjudge/categories.js?v=1" defer></script></body></html>';
    };
    const write = async (route,html,isNew=true) => {
      const dir = join(output,en?'en':'',route);
      await mkdir(dir,{recursive:true}); await writeFile(join(dir,'index.html'),html);
      if (isNew) { const url='https://asylumjudge.com'+path(route); sitemapRows.push({loc:url,lastmod:new Date().toISOString().slice(0,10)}); added.push(url); }
    };
    const quick = '<div class="category-cards">'+selectedStates.map(code=>'<a href="'+statePath(code)+'"><strong>'+e(stateName(code))+'</strong><span>'+text('Courts, judges and annual rates','法院、法官与年度通过率')+' →</span></a>').join('')+'</div>';
    const stateTables = years.map(year=>{
      const rows = source.states.map(state=>({...state,...state.yearly.find(row=>row.fiscal_year===year)})).filter(row=>row.fiscal_year)
        .sort((a,b)=>n(b.total_asylum_decisions)-n(a.total_asylum_decisions));
      return '<section class="category-period" id="fy-'+year+'" data-year-panel="'+year+'"><h2>'+periodLabel(year)+'</h2>'+
        table([text('State / territory','州 / 地区'),text('Courts','法院'),text('Judges','法官'),...metricHeaders],
          rows.map(row=>'<tr data-category-filter-row>'+cell('<a href="'+statePath(row.state)+'?fy='+year+'">'+e(stateName(row.state))+' ('+row.state+')</a>')+cell(fmt(row.courts))+cell(fmt(row.judges))+metrics(row)+'</tr>').join(''))+'</section>';
    }).join('');
    const search = label => '<label class="category-search">'+label+'<input type="search" data-category-search placeholder="'+label+'"></label><p data-category-status role="status" aria-live="polite"></p>';
    await write('states',page('states',text('Immigration Judge Approval Rates by State','美国各州移民法官通过率'),
      text('Browse state and territory asylum statistics, immigration courts and judge profiles. Compare fiscal-year grants, denials, decision volumes and approval rates.',
        '按州及地区查看美国移民法院的庇护批准数、拒绝数、样本量和通过率，进入各州法院与法官资料，并分别比较完整财年和本年度累计数据。'),
      '<h2>'+text('Explore states','重点州入口')+'</h2>'+quick+tabs(source.latest_fiscal_year)+search(text('Filter states','筛选州或州缩写'))+stateTables),false);
    for (const state of source.states) {
      if (!stateSlug(state.state)) throw new Error('Missing category state name: '+state.state);
      const stateJudges = catalog.filter(judge=>judge.directory_state===state.state).sort((a,b)=>a.judge_name.localeCompare(b.judge_name));
      const panels = years.map(year=>{
        const row = state.yearly.find(row=>row.fiscal_year===year);
        if (!row) return '';
        const national = source.national.find(row=>row.fiscal_year===year);
        const courts = source.courts.filter(c=>c.state===state.state).map(c=>({...c,...c.yearly.find(r=>r.fiscal_year===year)})).filter(c=>c.fiscal_year)
          .sort((a,b)=>n(b.total_asylum_decisions)-n(a.total_asylum_decisions));
        return '<section class="category-period" id="fy-'+year+'" data-year-panel="'+year+'"><h2>'+periodLabel(year)+'</h2>'+
          '<div class="category-metrics"><div><span>'+text('State approval rate','本州通过率')+'</span><strong>'+pct(row)+'</strong></div><div><span>'+text('National approval rate','全国通过率')+'</span><strong>'+pct(national)+'</strong></div><div><span>'+text('Grants + denials','批准 + 拒绝样本量')+'</span><strong>'+fmt(sample(row))+'</strong></div><div><span>'+text('Courts','法院数量')+'</span><strong>'+fmt(row.courts)+'</strong></div></div>'+
          '<h3>'+text('Immigration court asylum approval rates','各移民法院庇护通过率')+'</h3>'+
          table([text('Court','法院'),...metricHeaders],courts.map(c=>'<tr>'+cell(courtRoutes.has(c.court_name)?'<a href="'+path(courtRoutes.get(c.court_name))+'?fy='+year+'">'+e(c.court_name)+'</a>':e(c.court_name))+metrics(c)+'</tr>').join(''))+'</section>';
      }).join('');
      const directory = '<section><h2>'+text('Immigration judge directory','移民法官资料目录')+'</h2><p>'+text('Grouped by the court listed on each profile. This is not a current employment roster or a record of that judge’s assignment in every fiscal year.',
        '按资料页列示的法院归类。此目录不是当前在职名单，也不代表法官在各财年均在该州任职。')+'</p>'+search(text('Search judge or court','搜索法官或法院'))+
        '<ul class="category-judge-grid">'+stateJudges.map(j=>'<li data-category-filter-row><a href="'+judgePath(j)+'">'+e(j.judge_name)+'</a><small>'+e(j.court_name)+'</small></li>').join('')+'</ul></section>';
      await write('states/'+stateSlug(state.state),page('states/'+stateSlug(state.state),
        text(stateName(state.state)+' Immigration Judge Approval Rates',stateName(state.state)+'移民法官通过率'),
        text('Explore '+stateName(state.state)+' asylum approval rates, grants and denials by fiscal year, with immigration court statistics and links to judge profiles.',
          '查看'+stateName(state.state)+'各财年的庇护批准与拒绝数据、移民法院通过率和案件样本量，并通过法官目录进入详细资料，了解统计期间和历史表现。'),
        tabs(source.latest_fiscal_year)+panels+directory+'<p><a href="'+path('judge-approval-rates')+'">'+text('Compare annual judge approval rates nationwide','比较全国法官年度通过率')+' →</a></p>'));
    }
    const ranking = years.map(year=>{
      const rows = eligibleJudges(annual,year);
      return '<section class="category-period" id="fy-'+year+'" data-year-panel="'+year+'"><h2>'+periodLabel(year)+'</h2><p>'+text('Sorted by approval rate, highest first. ','按通过率从高到低排列。')+rows.length+text(' eligible profiles before filtering.','个符合门槛的资料，筛选前。')+'</p>'+
        table([text('Judge','法官'),text('Court listed on profile','资料页列示法院'),text('Granted','批准'),text('Denied','拒绝'),text('Sample (grants + denials)','样本量（批准 + 拒绝）'),text('Approval rate','通过率')],
        rows.map(j=>'<tr data-category-filter-row data-sample="'+sample(j)+'" data-rate="'+approvalRate(j)+'">'+cell('<a href="'+judgePath(j)+'">'+e(j.judge_name)+'</a>')+cell(e(j.court_name))+cell(fmt(j.grants))+cell(fmt(j.denials))+cell(fmt(sample(j)))+cell(pct(j))+'</tr>').join(''),'data-category-ranking')+'</section>';
    }).join('');
    const controls = '<div class="category-controls">'+search(text('Search judge or court','搜索法官或法院'))+
      '<label>'+text('Minimum sample','最低样本量')+'<select data-category-minimum><option value="100">100</option><option value="200">200</option><option value="500">500</option></select></label>'+
      '<label>'+text('Sort by','排序方式')+'<select data-category-sort><option value="rate">'+text('Highest approval rate','通过率从高到低')+'</option><option value="sample">'+text('Most decisions','样本量从多到少')+'</option></select></label></div>';
    await write('judge-approval-rates',page('judge-approval-rates',text('Immigration Judge Approval Rates: Annual Comparison','移民法官年度通过率比较'),
      text('Compare immigration judges with at least 100 asylum grants and denials in the same fiscal year. Explore higher approval rates alongside sample size and court profiles.',
        '按同一财年比较批准与拒绝合计至少100件的移民法官，查看通过率较高的法官、批准和拒绝数量以及样本量；完整年度与本年度累计分开显示。'),
      '<p class="category-notice">'+text('Includes uniquely matched judge profiles from the published nationality-by-year records, summed across nationalities. Unmatched or ambiguous profiles and samples below 100 are excluded. This is not a complete national ranking. Profile courts do not establish historical assignments or current employment.',
        '根据已发布的法官国籍年度记录，汇总各国籍数据；仅纳入能唯一匹配资料页且样本量至少100件的法官。无法匹配、有歧义及小样本记录不列入，因此并非完整全国排名。资料页法院不代表历年任职地点或当前在职状态。')+'</p>'+
      tabs(completeYear)+controls+ranking,completeYear));

    const homeFile = join(output,en?'en':'','index.html');
    let home = await readFile(homeFile,'utf8');
    const homeBlock = '<section class="shell category-home" data-category-home><h2>'+text('Immigration judge approval rates by state','按州查询移民法官通过率')+'</h2>'+quick+
      '<div class="category-home-links"><a href="'+path('states')+'">'+text('All states and territories','全部州及地区')+' →</a><a href="'+path('judge-approval-rates')+'">'+text('Higher approval rates · annual comparison','高通过率法官 · 年度比较')+' →</a><a href="'+path('judge-approval-rates')+'?sort=sample">'+text('Judges with more decisions','高样本量法官查询')+' →</a></div></section>';
    home = home.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/,'$1'+homeBlock);
    home = home.replace(/(<nav class="home-nav"[^>]*>[\s\S]*?)(<\/nav>)/,'$1<a href="'+path('judge-approval-rates')+'">'+text('Approval rate comparison','通过率比较')+'</a>$2');
    home = home.replace(/href="(?:\/en)?\/courts\/\?state=([A-Z]{2})&amp;fy=(\d+)"/g,(match,code,fy)=>stateSlug(code)?'href="'+statePath(code)+'?fy='+fy+'"':match);
    home = home.replace('</head>','<link rel="stylesheet" href="/asylumjudge/categories.css?v=1"><script src="/asylumjudge/categories.js?v=1" defer></script></head>');
    await writeFile(homeFile,home);
    // Court pages link back to a state landing page; existing entity URLs stay stable.
    for (const court of courtData.courts) {
      const code=court.court_state;
      if (!source.states.some(s=>s.state===code)) continue;
      const file=join(output,en?'en':'',courtRoutes.get(court.court_name),'index.html');
      let html=await readFile(file,'utf8');
      html=html.replace('</main>','<p class="judge-shell"><a href="'+statePath(code)+'">'+e(stateName(code))+' · '+text('State asylum data and judges','本州庇护数据与法官')+'</a></p></main>');
      await writeFile(file,html);
    }
  }
  await writeFile(join(output,'asylumjudge/category-urls.json'),JSON.stringify({added,snapshot:source.source_snapshot_date,years},null,2));
  console.log('AsylumJudge categories: '+source.states.length+' states/territories in Chinese and English; annual comparison default FY '+completeYear);
  return sitemapRows;
}
