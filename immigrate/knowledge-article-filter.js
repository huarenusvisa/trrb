(function(){
  'use strict';

  const params=new URLSearchParams(location.search);
  const path=params.get('path')||'study';
  const topic=params.get('topic')||'';
  const root=document.querySelector('#article-list');
  if(!root)return;

  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const SECTIONS={'重要新闻':'important-news','热门头条':'hot-headlines','美国时政':'us-politics','美国警情':'us-crime','中国官场':'china-officialdom','移民美国':'immigration','庇护百科':'asylum','驱逐快报':'deport','ICE执法动态':'ice','ICE执法':'ice'};

  // The generic center script may finish first and briefly render loosely matched
  // or cached articles. Replace that intermediate state with one stable loader.
  root.dataset.strictLoading='true';
  root.innerHTML='<div class="empty-state">正在读取最新且符合本专题的内容…</div>';

  const rules={
    f1:{terms:['f-1','f1学生','学生签证','i-20','i20','sevis','留学生身份','f-1签证'],exclude:['f-16','f-35','f2a','f-2a','h-1b','ga-57','战机','导弹','军事','诈骗','医保']},
    j1:{terms:['j-1','j1签证','交流访问','ds-2019','两年回国要求'],exclude:['战机','军事']},
    m1:{terms:['m-1','m1签证','职业学生','职业学校签证']},
    cpt:{terms:['cpt','课程实习','curricular practical training']},
    opt:{terms:['opt','optional practical training','毕业实习','失业天数']},
    'stem-opt':{terms:['stem opt','stem-opt','i-983','24个月延期']},
    'day-1-cpt':{terms:['day 1 cpt','day-1 cpt','第一天cpt']},
    h1b:{terms:['h-1b','h1b','专业职位','lca','h-1b抽签']},
    l1:{terms:['l-1','l1签证','跨国公司派遣']},
    o1:{terms:['o-1','o1签证','杰出人才签证']},
    h2a:{terms:['h-2a','h2a','农业工签证']},
    h2b:{terms:['h-2b','h2b','临时非农业工']},
    tn:{terms:['tn签证','tn身份']},
    'e1-e2':{terms:['e-1签证','e-2签证','条约投资','条约贸易']},
    r1:{terms:['r-1','r1签证','宗教工作者']},
    eb1a:{terms:['eb-1a','eb1a','杰出人才绿卡','final merits']},
    eb1b:{terms:['eb-1b','eb1b','杰出教授','杰出研究员']},
    eb1c:{terms:['eb-1c','eb1c','跨国高管绿卡']},
    niw:{terms:['niw','国家利益豁免','dhanasar']},
    'eb2-perm':{terms:['eb-2 perm','eb2 perm','劳工证','eta-9089']},
    eb3:{terms:['eb-3','eb3','技术工移民','非技术工移民']},
    eb4:{terms:['eb-4','eb4','特殊移民']},
    eb5:{terms:['eb-5','eb5','投资移民','i-526e','i-829']},
    'citizen-spouse':{terms:['婚姻绿卡','婚绿','公民配偶','i-130a','i-751']},
    f2a:{terms:['f2a','f-2a','绿卡配偶','表a与表b']},
    k1:{terms:['k-1','k1未婚','未婚夫签证','未婚妻签证','i-129f']},
    parents:{terms:['父母移民','公民申请父母','父母绿卡']},
    children:{terms:['子女移民','申请子女绿卡','cspa']},
    siblings:{terms:['兄弟姐妹移民','f4移民','公民申请兄弟姐妹']},
    'cr1-ir1':{terms:['cr-1','ir-1','cr1','ir1','配偶移民签证']},
    'family-preference':{terms:['家庭优先','f2b','f3移民','f4移民','签证公告']},
    asylum:{terms:['政治庇护','庇护申请','i-589','庇护面谈','庇护时钟']},
    withholding:{terms:['防止递解','withholding of removal']},
    cat:{terms:['cat保护','禁止酷刑公约','convention against torture']},
    vawa:{terms:['vawa','家暴绿卡','i-360自我申请']},
    'u-visa':{terms:['u签证','u visa','i-918','执法认证']},
    't-visa':{terms:['t签证','t visa','i-914','人口贩运受害者']},
    sijs:{terms:['sijs','特殊移民青少年','特殊青少年']},
    tps:{terms:['tps','临时保护身份','i-821']},
    'b2-to-f1':{terms:['b-2转f-1','b2转f1','旅游转学生','i-539转f1']},
    'f1-to-h1b':{terms:['f-1转h-1b','f1转h1b','cap-gap']},
    'j1-waiver':{terms:['j-1豁免','j1豁免','212(e)','ds-3035']},
    extension:{terms:['身份延期','延期停留','i-539延期']},
    reinstatement:{terms:['身份恢复','f-1 reinstatement','学生身份恢复']},
    i485:{terms:['i-485','i485','境内调整身份','调整身份申请']},
    ead:{terms:['ead工卡','i-765','就业授权']},
    'advance-parole':{terms:['advance parole','i-131','旅行许可','回美纸']},
    n400:{terms:['n-400','n400','入籍申请']},
    'continuous-residence':{terms:['连续居住','continuous residence']},
    'physical-presence':{terms:['实际居住','physical presence']},
    tests:{terms:['入籍考试','公民考试','英语考试','n-648']},
    interview:{terms:['入籍面试','n-400面试','n-14']},
    oath:{terms:['入籍宣誓','效忠宣誓','n-445']},
    n600:{terms:['n-600','n600','公民证明']},
    'derived-citizenship':{terms:['衍生公民','取得公民','自动取得公民身份']}
  };

  const categoryTopics={
    study:['f1','j1','m1','cpt','opt','stem-opt','day-1-cpt'],
    work:['h1b','l1','o1','h2a','h2b','tn','e1-e2','r1'],
    employment:['eb1a','eb1b','eb1c','niw','eb2-perm','eb3','eb4','eb5'],
    family:['citizen-spouse','f2a','k1','parents','children','siblings','cr1-ir1','family-preference'],
    humanitarian:['asylum','withholding','cat','vawa','u-visa','t-visa','sijs','tps'],
    'change-status':['b2-to-f1','f1-to-h1b','j1-waiver','extension','reinstatement','i485','ead','advance-parole'],
    citizenship:['n400','continuous-residence','physical-presence','tests','interview','oath','n600','derived-citizenship']
  };

  const topicCategorySegments={
    asylum:'政治庇护',
    withholding:'防止递解',
    cat:'禁止酷刑公约保护',
    vawa:'VAWA家暴保护',
    'u-visa':'U签证',
    't-visa':'T签证',
    sijs:'SIJS特殊青少年',
    tps:'TPS临时保护身份'
  };

  function normalize(value){return String(value||'').toLowerCase().replace(/[‐‑‒–—]/g,'-').replace(/\s+/g,' ').trim();}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function articleUrl(row){
    if(typeof window.TRRB_articleUrl==='function'){
      const routed=window.TRRB_articleUrl({id:row.id,slug:row.slug,category:row.category_name,category_name:row.category_name,topicKey:row.topic_key,topic_key:row.topic_key});
      if(routed)return routed;
    }
    const slug=String(row.slug||'').trim();
    if(slug){const topicKey=String(row.topic_key||'').trim().toLowerCase();const section=topicKey==='trump'?'trump':topicKey==='ice'?'ice':(SECTIONS[String(row.category_name||'').trim()]||'news');return `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;}
    const id=String(row.id||'').trim();
    return id?`/news/${encodeURIComponent(id)}`:'/';
  }

  function score(row,rule){
    const title=normalize(row.title);
    const summary=normalize(row.summary);
    const content=normalize(row.content).slice(0,1800);
    if((rule.exclude||[]).some(term=>title.includes(normalize(term))||summary.includes(normalize(term))))return -100;
    let total=0;
    for(const term of rule.terms||[]){
      const key=normalize(term);
      if(title.includes(key))total+=8;
      if(summary.includes(key))total+=4;
      if(content.includes(key))total+=1;
    }
    return total;
  }

  function isRelevant(row){
    if(topic&&rules[topic])return score(row,rules[topic])>=8;
    const topics=categoryTopics[path]||[];
    return topics.some(slug=>score(row,rules[slug]||{terms:[]})>=6);
  }

  function titleFingerprint(value){
    return normalize(value)
      .replace(/[\s，。！？、：；,.!?:;“”‘’'"（）()《》【】\[\]·/\\|_-]+/g,'')
      .replace(/(?:全面)?(?:解析|详解|指南|介绍|说明)$/,'');
  }

  function titleBigrams(value){
    const text=titleFingerprint(value);
    const grams=new Set();
    if(text.length<2){if(text)grams.add(text);return grams;}
    for(let index=0;index<text.length-1;index+=1)grams.add(text.slice(index,index+2));
    return grams;
  }

  function titleSimilarity(left,right){
    const a=titleBigrams(left);
    const b=titleBigrams(right);
    if(!a.size||!b.size)return 0;
    let overlap=0;
    a.forEach(gram=>{if(b.has(gram))overlap+=1;});
    return (2*overlap)/(a.size+b.size);
  }

  function dedupe(rows){
    const unique=[];
    const identities=new Set();
    const fingerprints=new Set();
    rows.forEach(row=>{
      const identity=String(row.id||row.slug||'').trim().toLowerCase();
      const fingerprint=titleFingerprint(row.title);
      if((identity&&identities.has(identity))||(fingerprint&&fingerprints.has(fingerprint)))return;
      if(unique.some(item=>titleSimilarity(item.title,row.title)>=0.88))return;
      if(identity)identities.add(identity);
      if(fingerprint)fingerprints.add(fingerprint);
      unique.push(row);
    });
    return unique;
  }

  function articlesUrl(select,categoryPattern,limit){
    const url=new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set('select',select);
    url.searchParams.set('status','eq.published');
    if(categoryPattern)url.searchParams.set('category_name',`like.${categoryPattern}`);
    url.searchParams.set('order','published_at.desc.nullslast');
    url.searchParams.set('limit',String(limit));
    return url.toString();
  }

  async function fetchRows(url){
    const response=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:'application/json'},cache:'no-store'});
    if(!response.ok)throw new Error(response.status);
    return response.json();
  }

  async function applyStrictFilter(){
    const select=['id','title','slug','summary','content','category_name','topic_key','status','published_at'].join(',');
    try{
      const segment=path==='humanitarian'?topicCategorySegments[topic]:'';
      const categoryPattern=segment
        ?`移民美国·人道主义庇护·${segment}·*`
        :path==='humanitarian'?'移民美国·人道主义庇护·*':'';
      let items=[];

      if(categoryPattern){
        const scopedRows=await fetchRows(articlesUrl(select,categoryPattern,120));
        items=dedupe(scopedRows);
      }

      // Older articles may not carry the modern hierarchical category. Use them
      // only to fill a short list, and require a strong title-level match.
      if(items.length<20){
        const legacyRows=await fetchRows(articlesUrl(select,'',500));
        const scopedIds=new Set(items.map(row=>String(row.id||row.slug||'')));
        const fallback=legacyRows.filter(row=>!scopedIds.has(String(row.id||row.slug||''))&&isRelevant(row));
        items=dedupe(items.concat(fallback));
      }

      items=items.slice(0,20);
      if(!items.length){
        root.innerHTML='<div class="empty-state">该专题暂时没有符合要求的知识文章。新闻类、军事类和其他无关内容不会在这里显示。</div>';
        return;
      }
      root.innerHTML=items.map(item=>`<article class="article-item"><small>${escapeHtml(item.category_name||'移民美国')}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary||'查看完整知识内容与办理要点。')}</p><a href="${escapeHtml(articleUrl(item))}">阅读全文 →</a></article>`).join('');
    }catch(error){
      console.warn('Strict knowledge filter unavailable',error);
      root.innerHTML='<div class="empty-state">暂时无法读取最新内容，请稍后刷新。</div>';
    }finally{
      root.dataset.strictLoading='false';
      document.documentElement.dataset.knowledgeReady='true';
    }
  }

  applyStrictFilter();
})();
