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
    m1:['M-1是什么','适用学校','I-20与SEVIS','申请流程','学习期限','实习限制','身份转换','常见问题']
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
      const keys=topic?[topic.name,topic.slug,...(topic.slug==='f1'?['f-1','学生签证','i-20','sevis']:[])]:category.keywords;
      const items=rows.filter(row=>{const text=normalize([row.title,row.summary,row.content,row.category_name].filter(Boolean).join(' '));return keys.some(key=>text.includes(normalize(key)));}).slice(0,20);
      if(!items.length){root.innerHTML='<div class="empty-state">该专题的结构已经建立，相关知识文章发布后会自动显示在这里。</div>';return;}
      root.innerHTML=items.map(item=>`<article class="article-item"><small>${esc(category.nameZh)}</small><h3>${esc(item.title)}</h3><p>${esc(item.summary||'查看完整知识内容与办理要点。')}</p><a href="../article.html?id=${encodeURIComponent(item.id)}">阅读全文 →</a></article>`).join('');
    }catch(error){console.warn('Knowledge articles unavailable',error);root.innerHTML='<div class="empty-state">暂时无法读取文章，请稍后刷新。</div>';}
  }

  render();
  loadArticles();
})();