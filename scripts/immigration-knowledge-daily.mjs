import fs from 'node:fs/promises';

const categoryKey=process.argv[2];
const count=Number(process.env.KNOWLEDGE_ARTICLES_PER_CATEGORY||10);
const OPENAI_API_KEY=process.env.OPENAI_API_KEY;
const OPENAI_MODEL=process.env.OPENAI_MODEL||'gpt-5-mini';
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!categoryKey||!OPENAI_API_KEY||!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Missing category or required secrets');

const categories={
 study:{name:'赴美留学',topics:{f1:'F-1学生签证',j1:'J-1交流访问',m1:'M-1职业学生',cpt:'CPT',opt:'OPT','stem-opt':'STEM OPT','day-1-cpt':'Day 1 CPT'}},
 work:{name:'赴美工作',topics:{h1b:'H-1B专业工作',l1:'L-1跨国公司派遣',o1:'O-1杰出人才',h2a:'H-2A农业工',h2b:'H-2B临时工',tn:'TN专业人士','e1-e2':'E-1/E-2商业签证',r1:'R-1宗教工作者'}},
 employment:{name:'职业移民',topics:{eb1a:'EB-1A杰出人才',eb1b:'EB-1B教授研究员',eb1c:'EB-1C跨国高管',niw:'EB-2 NIW','eb2-perm':'EB-2 PERM',eb3:'EB-3',eb4:'EB-4',eb5:'EB-5投资移民'}},
 family:{name:'家庭移民',topics:{'citizen-spouse':'美国公民婚姻绿卡',f2a:'绿卡配偶F2A',k1:'K-1未婚夫/妻',parents:'父母移民',children:'子女移民',siblings:'兄弟姐妹移民','cr1-ir1':'CR-1/IR-1配偶移民','family-preference':'F1/F2B/F3/F4优先类别'}},
 humanitarian:{name:'人道主义庇护',topics:{asylum:'政治庇护',withholding:'防止递解',cat:'禁止酷刑公约保护',vawa:'VAWA家暴保护','u-visa':'U签证','t-visa':'T签证',sijs:'SIJS特殊青少年',tps:'TPS临时保护身份'}},
 'change-status':{name:'境内身份转换',topics:{'b2-to-f1':'B-2转F-1','f1-to-h1b':'F-1转H-1B','j1-waiver':'J-1豁免',extension:'身份延期',reinstatement:'身份恢复',i485:'I-485境内调整身份',ead:'EAD工卡','advance-parole':'Advance Parole旅行许可'}},
 citizenship:{name:'入籍美国公民',topics:{n400:'N-400入籍申请','continuous-residence':'连续居住','physical-presence':'实际居住',tests:'英语与公民考试',interview:'入籍面试',oath:'入籍宣誓',n600:'N-600公民证明','derived-citizenship':'衍生与取得公民'}}
};
const category=categories[categoryKey];
if(!category)throw new Error(`Unknown category ${categoryKey}`);

const sourceFiles=['immigrate/center.js','immigrate/study-knowledge-content.js','immigrate/work-knowledge-content.js','immigrate/employment-knowledge-content.js','immigrate/family-knowledge-content.js','immigrate/humanitarian-knowledge-content.js','immigrate/change-status-module.js','immigrate/citizenship-module.js'];
let source='';
for(const file of sourceFiles){try{source+='\n'+await fs.readFile(file,'utf8');}catch{}}
function labelsFor(slug){
 const escaped=slug.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[new RegExp(`["']?${escaped}["']?\\s*:\\s*\\[([^\\]]+)\\]`,'g')];
 const labels=[];
 for(const re of patterns){for(const m of source.matchAll(re)){for(const q of m[1].matchAll(/["']([^"']+)["']/g))labels.push(q[1]);}}
 return [...new Set(labels)].filter(x=>x.length>1);
}
async function sb(path,options={}){
 const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
 if(!r.ok)throw new Error(`Supabase ${r.status}: ${await r.text()}`);
 return r.status===204?null:r.json();
}
const existing=await sb(`articles?select=title,summary,content,category_name,published_at&status=eq.published&order=published_at.desc&limit=3000`);
const topicEntries=Object.entries(category.topics);
const candidates=[];
for(const [slug,name] of topicEntries){
 const labels=labelsFor(slug);
 const usable=labels.length?labels:[`${name}申请资格`,`${name}材料准备`,`${name}办理流程`,`${name}常见风险`,`${name}常见问题`];
 for(const label of usable){
  const needle=(name+' '+label).toLowerCase();
  const coverage=existing.filter(a=>`${a.title||''} ${a.summary||''} ${a.content||''}`.toLowerCase().includes(name.toLowerCase())&&`${a.title||''} ${a.summary||''} ${a.content||''}`.toLowerCase().includes(label.toLowerCase())).length;
  candidates.push({slug,name,label,coverage});
 }
}
candidates.sort((a,b)=>a.coverage-b.coverage||a.slug.localeCompare(b.slug)||a.label.localeCompare(b.label));
const selected=[]; const perTopic=new Map();
for(const c of candidates){if(selected.length>=count)break;const n=perTopic.get(c.slug)||0;if(n>=2)continue;selected.push(c);perTopic.set(c.slug,n+1);}

async function generate(item){
 const prompt=`你是唐人日报美国移民知识库编辑。请围绕“${category.name} / ${item.name} / ${item.label}”写一篇中文知识文章。要求：\n1. 标题准确，不夸张；\n2. 摘要80至120字；\n3. 正文900至1400字，使用清晰小标题；\n4. 解释适用人群、资格、流程、材料、时间节点、风险和常见误区；\n5. 不编造最新费用、处理时间、排期或政策数字；涉及会变化的信息明确提示以USCIS、国务院或主管机关最新规则为准；\n6. 保持中立，不构成法律意见；\n7. 必须自然出现专题名“${item.name}”和标签“${item.label}”；\n8. 仅返回JSON：{"title":"","summary":"","content":""}`;
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:OPENAI_MODEL,input:prompt,text:{format:{type:'json_schema',name:'article',strict:true,schema:{type:'object',additionalProperties:false,required:['title','summary','content'],properties:{title:{type:'string'},summary:{type:'string'},content:{type:'string'}}}}}})});
 if(!r.ok)throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
 const data=await r.json();
 const text=data.output_text||data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
 if(!text)throw new Error('No model output');
 return JSON.parse(text);
}
let published=0;
for(const item of selected){
 try{
  const article=await generate(item);
  const duplicate=existing.some(a=>(a.title||'').trim()===article.title.trim());
  if(duplicate){console.log('skip duplicate',article.title);continue;}
  await sb('articles',{method:'POST',body:JSON.stringify({title:article.title,summary:article.summary,content:article.content,category_name:`移民美国·${category.name}·${item.name}·${item.label}`,status:'published',published_at:new Date().toISOString()})});
  existing.push(article); published++; console.log(`published ${published}/${count}: ${article.title}`);
 }catch(error){console.error('item failed',item,error.message);}
}
if(published===0)throw new Error('No articles published');
console.log(JSON.stringify({category:categoryKey,requested:count,published}));