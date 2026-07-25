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
    r1:['R-1是什么','宗教组织资格','宗教职业与宗教工作','两年成员要求','每周工作时间','I-129申请','现场核查','签证与入境','期限与延期','更换宗教组织','配偶R-2','R-1转EB-4','常见问题'],

    eb1a:['EB-1A是什么','适合哪些申请人','无需雇主担保与劳工证','一次性重大成就','十项证据标准','至少满足三项标准','最终优势判断','持续性国家或国际声誉','拟在美国继续相关领域工作','证据规划与材料组织','推荐信','媒体报道与原创贡献','评审、展览与重要角色','高薪与商业成功','I-140申请流程','加急处理','RFE与NOID应对','排期与优先日期','I-485境内调整身份','领事程序','配偶与未成年子女','常见拒绝原因','常见问题'],
    eb1b:['EB-1B是什么','杰出教授或研究人员资格','国际认可要求','至少三年教学或研究经验','六项证据标准','美国雇主担保','大学或研究机构资格','私营雇主研究岗位要求','永久职位或终身教职','I-140申请流程','证据与推荐信','加急处理','排期与I-485','配偶与子女','常见问题'],
    eb1c:['EB-1C是什么','跨国经理与高管资格','境外一年任职要求','美国与境外公司关联关系','经理职能与高管职能','美国公司经营满一年','无需PERM劳工证','I-140申请流程','公司证据与组织架构','人员管理与职能管理','L-1A转EB-1C','排期与I-485','领事程序','常见风险','常见问题'],
    niw:['EB-2 NIW是什么','EB-2基础资格','高等学位或特殊能力','无需雇主担保与劳工证','Dhanasar三项标准','拟议事业具有实质价值与国家重要性','申请人具备推进事业的良好条件','豁免工作邀请与劳工证符合美国利益','国家利益证据','专业履历与成果','论文、引用与评审','专利、项目与商业影响','创业者NIW','医生NIW','工程师与科技人才NIW','教育、艺术与商业领域NIW','推荐信与独立推荐人','商业计划与未来工作计划','I-140申请流程','加急处理','RFE与NOID应对','排期与I-485','领事程序','配偶与子女','常见问题'],
    'eb2-perm':['EB-2 PERM是什么','高等学位类别','特殊能力类别','美国雇主担保','岗位最低要求设计','现行工资PWD','招聘与劳动力市场测试','ETA-9089劳工证','审计与监督招聘','PERM批准后的I-140','雇主支付能力','学历与工作经验证明','优先日期与排期','I-485或领事程序','雇主变更与AC21','常见风险','常见问题'],
    eb3:['EB-3是什么','专业人士类别','技术工人类别','其他工人类别','美国雇主担保','岗位要求与申请人资格','现行工资PWD','招聘程序','ETA-9089劳工证','I-140申请','雇主支付能力','排期与优先日期','I-485境内调整身份','领事程序','工作真实性与雇佣承诺','雇主变更与AC21','配偶与子女','常见骗局与风险','常见问题'],
    eb4:['EB-4是什么','特殊移民类别范围','宗教工作者移民','特殊移民青少年SIJS','部分国际组织雇员','广播人员及其他特殊类别','分类资格与法律依据','I-360申请流程','雇主或组织证明','排期与签证名额','I-485或领事程序','配偶与子女','常见问题'],
    eb5:['EB-5是什么','投资移民基本结构','投资金额要求','目标就业区TEA','区域中心项目','直接投资','新商业企业','创造至少十个全职就业','资金合法来源','资金路径追踪','赠与、贷款与资产出售','商业计划与经济分析','I-526E申请','预留签证类别','排期与优先日期','I-485同时递交条件','领事程序','两年有条件绿卡','I-829解除条件','项目风险与尽职调查','资金返还不等于绿卡保证','配偶与未成年子女','常见问题'],

    'citizen-spouse':['美国公民婚姻绿卡是什么','境内调整身份与境外领事程序','婚姻真实性要求','合法入境与身份逾期问题','I-130与I-130A','I-485同时递交','I-864经济担保','I-693体检','I-765工卡与I-131回美证','联合账户与共同生活证据','指纹与背景审查','婚姻绿卡面试','补件RFE与意向拒绝NOID','两年条件绿卡与十年绿卡','I-751解除条件','境外配偶NVC流程','公共负担与担保责任','常见风险与婚姻欺诈','常见问题'],
    f2a:['F2A是什么','适用配偶与未满21岁未婚子女','绿卡持有者申请资格','I-130申请','优先日期','签证公告表A与表B','境内I-485递交条件','身份维持与排期等待','境外NVC与DS-260','I-864经济担保','随行与后续加入子女','申请人入籍后的类别升级','年龄冻结与CSPA','婚姻真实性证据','面试与补件','常见问题'],
    k1:['K-1未婚夫妻签证是什么','美国公民申请资格','双方两年内见面要求','真实结婚意图','I-129F申请','美国驻外使领馆程序','DS-160与体检','签证面试','入境后90天内结婚','只能与原申请人结婚','结婚后I-485调整身份','K-2子女','I-864经济担保','工作许可与旅行限制','分手或未结婚的后果','常见问题'],
    parents:['父母移民是什么','申请人必须是年满21岁美国公民','绿卡持有者不能申请父母','亲生父母资格','继父母关系要求','养父母关系要求','父母分别提交I-130','境内I-485同时递交','境外NVC与DS-260','出生证明与亲属关系证据','I-864经济担保','体检与面试','非法入境与其他不准入问题','父母获得绿卡后的事项','常见问题'],
    children:['子女移民类别概览','美国公民申请子女','绿卡持有者申请子女','未满21岁与年满21岁区别','已婚与未婚区别','继子女关系','收养子女关系','I-130与优先日期','直系亲属与家庭优先类别','CSPA儿童身份保护','境内调整身份','境外领事程序','随行与后续加入','子女结婚对类别的影响','常见问题'],
    siblings:['兄弟姐妹移民F4是什么','申请人必须年满21岁且为美国公民','亲兄弟姐妹关系证明','同父异母或同母异父关系','继兄弟姐妹关系','收养关系','I-130申请','优先日期与长期排期','配偶和未成年子女随行','NVC与领事程序','CSPA年龄保护','申请人死亡后的可能补救','常见问题'],
    'cr1-ir1':['CR-1与IR-1是什么','CR-1与IR-1区别','结婚满两年的判断时间','I-130与I-130A','USCIS批准后转NVC','缴费与选择代理人','DS-260移民签证申请','I-864经济担保','民事文件与无犯罪证明','体检与领事面试','行政审查','移民签证入境','绿卡制作费','CR-1入境后I-751解除条件','常见问题'],
    'family-preference':['家庭优先类别是什么','F1公民未婚成年子女','F2A绿卡配偶及未成年子女','F2B绿卡未婚成年子女','F3公民已婚子女','F4公民兄弟姐妹','优先日期','签证公告表A与表B','排期倒退','类别转换与自动升级','申请人入籍的影响','结婚或离婚的影响','CSPA年龄计算','境内I-485条件','境外NVC程序','常见问题']
  };

  const topicAliases={
    h1b:['h-1b','专业职位','lca','抽签'],l1:['l-1','跨国公司','跨国派遣'],o1:['o-1','杰出人才','杰出能力'],h2a:['h-2a','农业工'],h2b:['h-2b','临时工'],tn:['tn签证','专业人士'],'e1-e2':['e-1','e-2','条约贸易','条约投资'],r1:['r-1','宗教工作者'],
    eb1a:['eb-1a','杰出人才绿卡','final merits','最终优势判断'],eb1b:['eb-1b','杰出教授','杰出研究员'],eb1c:['eb-1c','跨国高管','跨国经理'],niw:['eb-2 niw','国家利益豁免','dhanasar'],'eb2-perm':['eb-2 perm','劳工证','eta-9089','pwd'],eb3:['eb-3','技术工','非技术工','专业人士移民'],eb4:['eb-4','特殊移民','宗教移民'],eb5:['eb-5','投资移民','i-526e','i-829','区域中心','tea'],
    'citizen-spouse':['婚绿','婚姻绿卡','公民配偶','i-130a','同时递交'],'f2a':['绿卡配偶','f-2a','表a','表b'],'k1':['k-1','未婚妻签证','未婚夫签证','i-129f'],parents:['父母绿卡','公民申请父母','直系亲属'],children:['子女绿卡','公民申请子女','绿卡申请子女'],siblings:['兄弟姐妹绿卡','f4','公民申请兄弟姐妹'],'cr1-ir1':['cr-1','ir-1','配偶移民签证','ds-260','nvc'],'family-preference':['家庭优先','f1','f2b','f3','f4','签证公告','优先日期']
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