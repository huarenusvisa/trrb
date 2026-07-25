(function(){
  const cfg=window.TRRB_IMMIGRATION_KNOWLEDGE||{categories:[]};
  const params=new URLSearchParams(location.search);
  const path=params.get('path')||'study';
  const topicSlug=params.get('topic')||'';
  const category=cfg.categories.find(x=>x.slug===path)||cfg.categories[0];
  const topic=category?.items.find(x=>x.slug===topicSlug)||null;
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';

  const topicBlueprint={
    f1:['F-1是什么','申请资格','学校录取与I-20','SEVIS缴费','DS-160填写','签证预约','面签准备','入境美国','维持合法身份','校内工作','CPT','OPT','STEM OPT','转学与毕业','常见问题'],
    opt:['OPT是什么','申请资格','申请时间线','I-765与材料','失业天数','雇主要求','旅行与再入境','身份衔接','常见问题'],
    cpt:['CPT是什么','申请资格','课程关联要求','兼职与全职CPT','学校授权','Day 1 CPT风险','CPT与OPT关系','常见问题'],
    j1:['J-1是什么','项目类别','DS-2019','SEVIS','签证申请','两年回国居住要求','J-1豁免','工作与实习','常见问题'],
    m1:['M-1是什么','适用学校','I-20与SEVIS','申请流程','学习期限','实习限制','身份转换','常见问题'],
    'stem-opt':['STEM OPT是什么','符合条件的专业','符合条件的雇主','I-983培训计划','申请时间线','24个月延期','失业天数','雇主变更','合规报告','常见问题'],
    'day-1-cpt':['Day 1 CPT是什么','适用项目','学校与课程要求','CPT授权','工作与课程关联','全职与兼职','潜在移民风险','H-1B与身份衔接','常见问题'],

    h1b:['H-1B是什么','专业职位要求','申请人与学历条件','雇主资格与雇佣关系','LCA劳工条件申请','注册与抽签','中签后I-129申请','名额豁免H-1B','工资标准','工作地点与职位变更','延期与六年期限','配偶H-4与工卡','离职与60天宽限期','转雇主与携带条款','出境签证与再入境','H-1B转绿卡','常见问题'],
    l1:['L-1是什么','L-1A与L-1B区别','境外任职一年要求','关联公司关系','经理与高管要求','专业知识要求','新办公室L-1','I-129申请流程','跨国公司批量申请','期限与延期','配偶L-2与工卡','L-1A转EB-1C','常见风险','常见问题'],
    o1:['O-1是什么','O-1A与O-1B区别','杰出能力标准','证据类型','美国雇主或代理人','咨询意见','I-129申请流程','活动行程与合同','期限与延期','更换雇主','配偶O-3','O-1与EB-1A衔接','常见问题'],
    h2a:['H-2A是什么','临时或季节性农业需求','雇主劳工认证','招募美国工人','工资与住房要求','I-129申请','领事签证','入境与工作期限','雇主变更限制','工人权利与保护','常见问题'],
    h2b:['H-2B是什么','临时需求类型','年度名额','劳工认证','美国工人招募','工资标准','I-129申请','领事签证与入境','延期与雇主变更','工人权利','常见问题'],
    tn:['TN是什么','适用国籍','职业清单','学历与执照要求','加拿大公民申请方式','墨西哥公民签证流程','雇主支持信','入境期限与延期','更换雇主','配偶TD','TN与移民倾向','常见问题'],
    'e1-e2':['E-1与E-2是什么','条约国家资格','E-1贸易要求','E-2实质性投资','企业控制与所有权','资金来源','企业经营计划','领事申请流程','境内身份转换','员工E签证','配偶与子女','延期与续签','E-2与绿卡规划','常见问题'],
    r1:['R-1是什么','宗教组织资格','宗教职业与宗教工作','两年成员要求','每周工作时间','I-129申请','现场核查','签证与入境','期限与延期','更换宗教组织','配偶R-2','R-1转EB-4','常见问题']
  };
  const topicAliases={
    h1b:['h-1b','专业职位','lca','抽签'],l1:['l-1','跨国公司','跨国派遣'],o1:['o-1','杰出人才','杰出能力'],h2a:['h-2a','农业工'],h2b:['h-2b','临时工'],tn:['tn签证','专业人士'],'e1-e2':['e-1','e-2','条约贸易','条约投资'],r1:['r-1','宗教工作者']
  };
  const defaultBlueprint=['项目介绍','适用人群','基本条件','申请流程','所需材料','费用与时间','身份维持','常见风险','常见问题'];

  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function itemUrl(item){return `./center.html?path=${encodeURIComponent(category.slug)}&topic=${encodeURIComponent(item.slug)}`;}
  function normalize(v){return String(v||'').toLowerCase().replace(/\s+/g,' ');}

  function render(){
    if(!category)return;
    document.title=`${topic?topic.name:category.nameZh} - 唐人日报移民知识中心`;
    document.querySelector('#center-en').textContent=category.nameEn;
    document.querySelector('#center-title').textContent=topic?`${topic.name}知识中心`:category.nameZh;
    document.querySelector('#center-description').textContent=topic?(topic.summary||`系统了解${topic.name}的申请条件、流程、材料、身份维持和常见问题。`):category.description;
    document.querySelector('#breadcrumbs').innerHTML=`<a href="./">移民美国</a><span>›</span><a href="./center.html?path=${esc(category.slug)}">${esc(category.nameZh)}</a>${topic?`<span>›</span><strong>${esc(topic.name)}</strong>`:''}`;
    document.querySelector('#topic-nav').innerHTML=category.items.map(item=>`<a class="${topic&&topic.slug===item.slug?'is-current':''}" href="${itemUrl(item)}">${esc(item.name)}</a>`).join('');

    const overview=document.querySelector('#topic-overview');
    if(topic){
      overview.innerHTML=`<h2>${esc(topic.name)}</h2><p>${esc(topic.summary||`进入${topic.name}专题，按步骤查看完整知识。`)}</p><div class="topic-grid">${category.items.filter(x=>x.slug!==topic.slug).slice(0,4).map(item=>`<a class="topic-card" href="${itemUrl(item)}"><strong>${esc(item.name)}</strong><span>${esc(item.summary||'查看专题知识')}</span></a>`).join('')}</div>`;
    }else{
      overview.innerHTML=`<h2>${esc(category.nameZh)}知识导航</h2><p>${esc(category.description)}</p><div class="topic-grid">${category.items.map(item=>`<a class="topic-card" href="${itemUrl(item)}"><strong>${esc(item.name)}</strong><span>${esc(item.summary||'进入专题知识中心')}</span></a>`).join('')}</div>`;
    }

    const steps=topic?(topicBlueprint[topic.slug]||defaultBlueprint):['先选择具体签证或项目','查看适用条件','了解申请流程','准备材料与时间线','阅读已发布知识文章'];
    document.querySelector('#structure-title').textContent=topic?`${topic.name}完整知识目录`:`${category.nameZh}使用方式`;
    document.querySelector('#knowledge-steps').innerHTML=steps.map((step,index)=>`<div class="knowledge-step"><strong>${String(index+1).padStart(2,'0')} · ${esc(step)}</strong><small>内容将按照统一知识模板持续补充</small></div>`).join('');
    document.querySelector('#articles-title').textContent=topic?`${topic.name}相关文章`:`${category.nameZh}相关文章`;
  }

  async function loadArticles(){
    const root=document.querySelector('#article-list');
    const select=['id','title','summary','content','category_name','status','published_at'].join(',');
    const url=`${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&order=published_at.desc.nullslast&limit=500`;
    try{
      const response=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:'application/json'}});
      if(!response.ok)throw new Error(response.status);
      const rows=await response.json();
      const keys=topic?[topic.name,topic.slug,...(topicAliases[topic.slug]||[]),...(topic.slug==='f1'?['f-1','学生签证','i-20','sevis']:[])]:category.keywords;
      const items=rows.filter(row=>{const text=normalize([row.title,row.summary,row.content,row.category_name].filter(Boolean).join(' '));return keys.some(key=>text.includes(normalize(key)));}).slice(0,20);
      if(!items.length){root.innerHTML='<div class="empty-state">该专题的结构已经建立，相关知识文章发布后会自动显示在这里。</div>';return;}
      root.innerHTML=items.map(item=>`<article class="article-item"><small>${esc(category.nameZh)}</small><h3>${esc(item.title)}</h3><p>${esc(item.summary||'查看完整知识内容与办理要点。')}</p><a href="../article.html?id=${encodeURIComponent(item.id)}">阅读全文 →</a></article>`).join('');
    }catch(error){console.warn('Knowledge articles unavailable',error);root.innerHTML='<div class="empty-state">暂时无法读取文章，请稍后刷新。</div>';}
  }

  render();
  loadArticles();
})();