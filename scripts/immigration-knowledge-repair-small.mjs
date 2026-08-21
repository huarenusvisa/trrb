import crypto from 'node:crypto';

const categoryKey = process.argv[2];
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET = Math.max(1, Number(process.env.KNOWLEDGE_ARTICLES_PER_TOPIC || 10));
const HOURS = Math.max(24, Number(process.env.KNOWLEDGE_HEALTH_WINDOW_HOURS || 30));
const BATCH = Math.max(1, Math.min(5, Number(process.env.KNOWLEDGE_SAFE_BATCH_SIZE || 5)));

if (!categoryKey || !OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing category or required secrets');
}

const categories = {
  study: ['赴美留学', ['F-1学生签证','J-1交流访问','M-1职业学生','CPT','OPT','STEM OPT','Day 1 CPT']],
  work: ['赴美工作', ['H-1B专业工作','L-1跨国公司派遣','O-1杰出人才','H-2A农业工','H-2B临时工','TN专业人士','E-1/E-2商业签证','R-1宗教工作者']],
  employment: ['职业移民', ['EB-1A杰出人才','EB-1B教授研究员','EB-1C跨国高管','EB-2 NIW','EB-2 PERM','EB-3','EB-4','EB-5投资移民']],
  family: ['家庭移民', ['美国公民婚姻绿卡','绿卡配偶F2A','K-1未婚夫/妻','父母移民','子女移民','兄弟姐妹移民','CR-1/IR-1配偶移民','F1/F2B/F3/F4优先类别']],
  humanitarian: ['人道主义庇护', ['政治庇护','防止递解','禁止酷刑公约保护','VAWA家暴保护','U签证','T签证','SIJS特殊青少年','TPS临时保护身份']],
  'change-status': ['境内身份转换', ['B-2转F-1','F-1转H-1B','J-1豁免','身份延期','身份恢复','I-485境内调整身份','EAD工卡','Advance Parole旅行许可']],
  citizenship: ['入籍美国公民', ['N-400入籍申请','连续居住','实际居住','英语与公民考试','入籍面试','入籍宣誓','N-600公民证明','衍生与取得公民']]
};

const selected = categories[categoryKey];
if (!selected) throw new Error(`Unknown category: ${categoryKey}`);
const [categoryName, topics] = selected;

const angles = [
  '申请资格与适用人群','材料清单与证据准备','完整办理流程','关键时间节点','费用与成本规划',
  '身份维持与合规要求','家属安排与衍生身份','常见风险与补件应对','拒绝原因与补救路径','常见误区与实务提醒',
  '面试或审核准备','获批后的后续事项','特殊情况处理','证据薄弱时的准备重点','申请前自查清单'
];

function headers(prefer = '') {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function sb(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers(options.prefer || ''), ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : null;
}

function outputText(data) {
  if (data?.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content?.text) return content.text;
    }
  }
  return '';
}

async function callModel(topic, selectedAngles, avoidTitles) {
  const prompt = `你是唐人日报“移民美国”知识库编辑。为“${categoryName} / ${topic}”生成${selectedAngles.length}篇独立中文知识文章，按下列角度一一对应：\n${selectedAngles.map((v,i)=>`${i+1}. ${v}`).join('\n')}\n\n要求：每篇标题专业且不重复；摘要80至120字；正文800至1200个汉字，含清晰小标题；说明资格、材料、流程、风险和常见误区；不得编造会变化的费用、排期或处理时间；注明不构成法律意见；只返回JSON。近期标题不得重复：\n${avoidTitles.slice(-60).map(v=>`- ${v}`).join('\n')}`;
  const schema = {
    type: 'object', additionalProperties: false, required: ['articles'],
    properties: { articles: { type: 'array', minItems: selectedAngles.length, maxItems: selectedAngles.length,
      items: { type: 'object', additionalProperties: false, required: ['title','summary','content'],
        properties: { title:{type:'string'}, summary:{type:'string'}, content:{type:'string'} } } } }
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, input: prompt, max_output_tokens: 12000,
      text: { format: { type:'json_schema', name:'immigration_articles_small_batch', strict:true, schema } } })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${raw.slice(0, 1200)}`);
  const data = JSON.parse(raw);
  const text = outputText(data);
  if (!text) throw new Error('OpenAI returned no output text');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.articles) || parsed.articles.length !== selectedAngles.length) throw new Error('Article count mismatch');
  return parsed.articles;
}

async function generateWithFallback(topic, selectedAngles, avoidTitles) {
  let error;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try { return await callModel(topic, selectedAngles, avoidTitles); }
    catch (e) { error = e; console.warn(`[immigration] ${topic} batch ${selectedAngles.length}, attempt ${attempt}: ${e.message}`); }
  }
  if (selectedAngles.length > 1) {
    const middle = Math.ceil(selectedAngles.length / 2);
    const first = await generateWithFallback(topic, selectedAngles.slice(0, middle), avoidTitles);
    const second = await generateWithFallback(topic, selectedAngles.slice(middle), [...avoidTitles, ...first.map(v=>v.title)]);
    return [...first, ...second];
  }
  throw error;
}

const cutoff = new Date(Date.now() - HOURS * 3600000).toISOString();
const recent = await sb(`articles?select=title,category_name,published_at&status=eq.published&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=5000`);
const historical = await sb('articles?select=title&status=eq.published&order=published_at.desc&limit=5000');
const titleSet = new Set((historical || []).map(v => String(v.title || '').trim()).filter(Boolean));

function prefix(topic) { return `移民美国·${categoryName}·${topic}·`; }
function count(topic) { return (recent || []).filter(v => String(v.category_name || '').startsWith(prefix(topic))).length; }
function articleSlug(title) {
  const base = String(title || '').normalize('NFKC').toLowerCase()
    .replace(/[\s/\\|]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return `${base || 'immigration-knowledge'}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

let insertedTotal = 0;
for (const topic of topics) {
  let current = count(topic);
  console.log(`[immigration] ${categoryName}/${topic}: ${current}/${TARGET}`);
  while (current < TARGET) {
    const size = Math.min(BATCH, TARGET - current);
    const selectedAngles = Array.from({length:size}, (_,i)=>angles[(current+i)%angles.length]);
    const generated = await generateWithFallback(topic, selectedAngles, [...titleSet]);
    const now = new Date().toISOString();
    const rows = generated.map((article,index)=>{
      const id = crypto.randomUUID();
      const title = String(article.title || '').trim();
      return {
        id,
        title,
        slug: articleSlug(title),
        summary: String(article.summary || '').trim(),
        content: String(article.content || '').trim(),
        category_name: `${prefix(topic)}${selectedAngles[index]}`,
        status: 'published',
        visibility: 'public',
        author: '唐人日报编辑部',
        published_at: now,
        created_at: now,
        metadata: { immigration_category: categoryName, immigration_topic: topic, writing_angle: selectedAngles[index], generated_by: 'small-batch-repair' }
      };
    }).filter(v => v.title && v.summary && v.content.length >= 400 && !titleSet.has(v.title));
    if (!rows.length) throw new Error(`${topic} generated no valid unique rows`);
    const saved = await sb('articles', { method:'POST', prefer:'return=representation', body:JSON.stringify(rows) });
    for (const row of saved || rows) {
      titleSet.add(row.title);
      recent.push(row);
    }
    insertedTotal += rows.length;
    current = count(topic);
    console.log(`[immigration] ${categoryName}/${topic}: inserted ${rows.length}, now ${current}/${TARGET}`);
  }
}
console.log(JSON.stringify({ category:categoryName, inserted:insertedTotal, completed:true }));
