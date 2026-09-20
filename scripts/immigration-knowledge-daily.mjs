import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {
  newYorkDateKey,
  plannedDailyTarget,
  publicationSlot,
  rotatingAngleOffset
} from './immigration-knowledge-plan.mjs';

const categoryKey = process.argv[2];
const targetPerTopic = Math.max(
  1,
  Math.min(50, Number(process.env.KNOWLEDGE_ARTICLES_PER_TOPIC || process.env.KNOWLEDGE_ARTICLES_PER_CATEGORY || 10))
);
const onlyTopic = String(process.env.KNOWLEDGE_ONLY_TOPIC || '').trim();
const batchSize = Math.max(1, Math.min(3, Number(process.env.KNOWLEDGE_BATCH_SIZE || 2)));
const windowHours = Math.max(48, Number(process.env.KNOWLEDGE_HEALTH_WINDOW_HOURS || 48));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_OUTPUT_TOKENS = Math.max(8000, Number(process.env.KNOWLEDGE_BATCH_MAX_OUTPUT_TOKENS || 20000));
const ASYLUM_OFFICIAL_SOURCE = 'https://www.uscis.gov/humanitarian/refugees-and-asylum/asylum';

if (!categoryKey || !OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing category or required secrets');
}

const categories = {
  study: {
    name: '赴美留学',
    topics: {
      f1: 'F-1学生签证',
      j1: 'J-1交流访问',
      m1: 'M-1职业学生',
      cpt: 'CPT',
      opt: 'OPT',
      'stem-opt': 'STEM OPT',
      'day-1-cpt': 'Day 1 CPT'
    }
  },
  work: {
    name: '赴美工作',
    topics: {
      h1b: 'H-1B专业工作',
      l1: 'L-1跨国公司派遣',
      o1: 'O-1杰出人才',
      h2a: 'H-2A农业工',
      h2b: 'H-2B临时工',
      tn: 'TN专业人士',
      'e1-e2': 'E-1/E-2商业签证',
      r1: 'R-1宗教工作者'
    }
  },
  employment: {
    name: '职业移民',
    topics: {
      eb1a: 'EB-1A杰出人才',
      eb1b: 'EB-1B教授研究员',
      eb1c: 'EB-1C跨国高管',
      niw: 'EB-2 NIW',
      'eb2-perm': 'EB-2 PERM',
      eb3: 'EB-3',
      eb4: 'EB-4',
      eb5: 'EB-5投资移民'
    }
  },
  family: {
    name: '家庭移民',
    topics: {
      'citizen-spouse': '美国公民婚姻绿卡',
      f2a: '绿卡配偶F2A',
      k1: 'K-1未婚夫/妻',
      parents: '父母移民',
      children: '子女移民',
      siblings: '兄弟姐妹移民',
      'cr1-ir1': 'CR-1/IR-1配偶移民',
      'family-preference': 'F1/F2B/F3/F4优先类别'
    }
  },
  humanitarian: {
    name: '人道主义庇护',
    topics: {
      asylum: '政治庇护',
      withholding: '防止递解',
      cat: '禁止酷刑公约保护',
      vawa: 'VAWA家暴保护',
      'u-visa': 'U签证',
      't-visa': 'T签证',
      sijs: 'SIJS特殊青少年',
      tps: 'TPS临时保护身份'
    }
  },
  'change-status': {
    name: '境内身份转换',
    topics: {
      'b2-to-f1': 'B-2转F-1',
      'f1-to-h1b': 'F-1转H-1B',
      'j1-waiver': 'J-1豁免',
      extension: '身份延期',
      reinstatement: '身份恢复',
      i485: 'I-485境内调整身份',
      ead: 'EAD工卡',
      'advance-parole': 'Advance Parole旅行许可'
    }
  },
  citizenship: {
    name: '入籍美国公民',
    topics: {
      n400: 'N-400入籍申请',
      'continuous-residence': '连续居住',
      'physical-presence': '实际居住',
      tests: '英语与公民考试',
      interview: '入籍面试',
      oath: '入籍宣誓',
      n600: 'N-600公民证明',
      'derived-citizenship': '衍生与取得公民'
    }
  }
};

const category = categories[categoryKey];
if (!category) throw new Error(`Unknown category ${categoryKey}`);

const sourceFiles = [
  'immigrate/center.js',
  'immigrate/study-knowledge-content.js',
  'immigrate/work-knowledge-content.js',
  'immigrate/employment-knowledge-content.js',
  'immigrate/family-knowledge-content.js',
  'immigrate/humanitarian-knowledge-content.js',
  'immigrate/change-status-module.js',
  'immigrate/citizenship-module.js'
];
let source = '';
for (const file of sourceFiles) {
  try {
    source += `\n${await fs.readFile(file, 'utf8')}`;
  } catch {
    // Some deployments may not include every optional source file.
  }
}

function labelsFor(slug) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [new RegExp(`["']?${escaped}["']?\\s*:\\s*\\[([^\\]]+)\\]`, 'g')];
  const labels = [];
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      for (const quoted of match[1].matchAll(/["']([^"']+)["']/g)) labels.push(quoted[1]);
    }
  }
  return [...new Set(labels)].filter(label => label.length > 1);
}

function anglePool(slug, topicName) {
  if (slug === 'asylum') {
    return [
      '五项受保护理由概览',
      '种族迫害与证据联系',
      '宗教迫害与信仰实践',
      '国籍迫害与身份认定',
      '政治观点与归因观点',
      '特定社会群体的不可改变特征、特定性与社会区分',
      '过去迫害与未来迫害恐惧',
      '政府无法或不愿提供保护',
      '迫害与受保护理由之间的因果联系',
      '混合动机与一个核心理由',
      'I-589表格递交前的完整核对', '一年申请期限与常见例外', '肯定式庇护面谈的准备顺序',
      '面谈通知、改期与未到场风险', '个人陈述的时间线与细节一致性', '身份证明与国籍证据',
      '医疗记录、照片和伤情证据', '证人声明如何做到具体可信', '国家状况证据的选择与使用',
      '翻译件与翻译证明要求', '社交媒体和电子证据的保存', '补件通知与回应策略',
      '可信度判断中的矛盾与遗漏', '创伤、记忆差异与合理解释', '庇护办公室结果：批准、拒绝与转庭',
      '转入移民法庭后的程序变化', '主日历庭前需要准备什么', '个别庭证词与交叉询问准备',
      '移民法庭证据提交期限', '口译质量与当庭异议', '律师缺席或代理失误的处理',
      'BIA上诉的基本框架与期限意识', '重新开案动议的证据重点', '联邦巡回法院审查范围概览',
      '不同巡回区判例为何可能不同', 'C08工卡资格与庇护时钟', '申请人造成延误对庇护时钟的影响',
      '地址变更与通知送达风险', '未成年人庇护申请的特殊问题', '配偶和子女的附属庇护问题',
      '刑事记录与庇护资格风险', '虚假陈述和轻率申请的严重后果', '第三国停留与安全第三国问题',
      '内部迁移是否合理可行', '人道主义庇护的适用场景', '强制人口控制相关主张',
      '家庭暴力与特定社会群体分析', '帮派威胁案件中的法律难点', '宗教活动在美国持续性的证据',
      '海外政治表达与回国风险', '政府人员与非政府迫害者的区别', '过去迫害推定与政府反驳',
      '未来恐惧的主观与客观要素', '严重伤害何时达到迫害程度', '歧视、骚扰与迫害的界线',
      '保护理由必须是迫害动机之一', '案例讲解：如何提炼裁判规则', '判例被推翻、限制或替代后的标记',
      'USCIS与EOIR数据口径不能混用', '通过率、样本量与时间范围的正确阅读'
    ].map(item => `${topicName}·${item}`);
  }
  const defaults = [
    '申请资格与适用人群',
    '材料清单与证据准备',
    '完整办理流程',
    '关键时间节点',
    '费用与成本规划',
    '身份维持与合规要求',
    '家属安排与衍生身份',
    '常见风险与补件应对',
    '拒绝原因与补救路径',
    '常见误区与实务案例',
    '面试或审核准备',
    '获批后的后续事项'
  ];
  return [...new Set([...labelsFor(slug), ...defaults.map(item => `${topicName}${item}`)])];
}

function articleSlug(title) {
  const base = String(title || '').normalize('NFKC').toLowerCase()
    .replace(/[\s/\\|]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
  return `${base || 'immigration-knowledge'}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

async function sb(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function outputText(data) {
  if (data.output_text) return data.output_text;
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  return '';
}

async function generateBatch(topicName, angles, avoidTitles) {
  const numberedAngles = angles.map((angle, index) => `${index + 1}. ${angle}`).join('\n');
  const avoid = avoidTitles.slice(-80).map(title => `- ${title}`).join('\n');
  const asylumGuard = topicName === '政治庇护'
    ? '\n政治庇护专用标准：可覆盖庇护基础、I-589、面谈、证据、可信度、移民法庭、BIA和联邦法院案例、C08工卡与庇护时钟、USCIS/EOIR政策及数据解读。官方来源由系统保存在后台元数据中，正文不强制显示链接；不得把提案写成已生效规则，不得编造案件、引证、费用、处理时间或通过率。'
    : '';
  const prompt = `你是唐人日报“移民美国”专业知识库编辑。请为“${category.name} / ${topicName}”一次生成${angles.length}篇彼此独立的中文知识文章。\n\n每篇文章必须严格对应下面同序号的写作角度，不能合并、遗漏或重复：\n${numberedAngles}\n\n统一要求：\n1. 每篇标题准确、专业、不夸张，标题之间不得近似；\n2. 每篇摘要80至120个汉字；\n3. 每篇正文900至1400个中文汉字（按汉字数量计算，不是token、字节或英文单词），至少分成6个完整自然段并使用清晰小标题；\n4. 只解释对应角度的法律概念、证据联系、判断因素、风险和常见误区；\n5. 不编造最新费用、处理时间、排期、配额或政策数字；涉及会变化的信息，明确提示以USCIS、美国国务院或主管机关最新规则为准；\n6. 保持中立、写实，不构成法律意见；\n7. 每篇必须自然出现专题名“${topicName}”；\n8. 不得复用以下近期标题：\n${avoid || '- 无'}\n9. 仅返回符合JSON Schema的结果，articles数组顺序必须与写作角度顺序一致。${asylumGuard}`;

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['articles'],
    properties: {
      articles: {
        type: 'array',
        minItems: angles.length,
        maxItems: angles.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'summary', 'content'],
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            content: { type: 'string' }
          }
        }
      }
    }
  };

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: prompt,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: 'json_schema',
              name: 'immigration_topic_articles',
              strict: true,
              schema
            }
          }
        }),
        signal: AbortSignal.timeout(120000)
      });
      if (!response.ok) {
        const detail = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`OpenAI ${response.status}: ${detail}`);
        throw new Error(`OpenAI retryable ${response.status}: ${detail}`);
      }
      const data = await response.json();
      const text = outputText(data);
      if (!text) throw new Error('No model output');
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.articles) || parsed.articles.length !== angles.length) {
        throw new Error(`Expected ${angles.length} articles, received ${parsed.articles?.length || 0}`);
      }
      return parsed.articles;
    } catch (error) {
      lastError = error;
      console.warn(`[knowledge] ${topicName} batch attempt ${attempt}/3 failed: ${error.message}`);
      if (attempt < 3) await sleep(attempt * 30000);
    }
  }
  throw lastError;
}

const runStartedAt = new Date();
const publicationDate = newYorkDateKey(runStartedAt);
const plannedTarget = plannedDailyTarget(runStartedAt, targetPerTopic);
const cutoff = new Date(runStartedAt.getTime() - windowHours * 3600000).toISOString();
const recentWindow = await sb(
  `articles?select=title,category_name,published_at&status=eq.published&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=3000`
);
const recent = (recentWindow || []).filter(article => newYorkDateKey(article.published_at) === publicationDate);
const historical = await sb(
  'articles?select=title&status=eq.published&order=published_at.desc&limit=5000'
);
const titleSet = new Set((historical || []).map(article => String(article.title || '').trim()).filter(Boolean));

function topicPrefix(topicName) {
  return `移民美国·${category.name}·${topicName}·`;
}

function recentTopicCount(topicName) {
  const prefix = topicPrefix(topicName);
  return (recent || []).filter(article => String(article.category_name || '').startsWith(prefix)).length;
}

let totalPublished = 0;
const results = {};

for (const [slug, topicName] of Object.entries(category.topics)) {
  if (onlyTopic && slug !== onlyTopic) continue;
  const already = recentTopicCount(topicName);
  let missing = Math.max(0, plannedTarget - already);
  results[slug] = { topic: topicName, before: already, requested: missing, published: 0 };

  if (!missing) {
    console.log(`[knowledge] ${category.name}/${topicName} already meets today's planned ${plannedTarget}/${targetPerTopic}`);
    continue;
  }

  const pool = anglePool(slug, topicName);
  const dayOffset = rotatingAngleOffset(publicationDate, pool.length);
  let angleOffset = dayOffset + already;

  const maxRounds = Math.min(120, Math.max(12, Math.ceil(missing / batchSize) * 3));
  for (let round = 1; round <= maxRounds && missing > 0; round += 1) {
    const requestCount = Math.min(missing, batchSize);
    const angles = Array.from({ length: requestCount }, (_, index) => pool[(angleOffset + index) % pool.length]);
    const articles = await generateBatch(topicName, angles, [...titleSet]);
    const rows = [];
    const batchTitles = new Set();
    const rejected = [];

    articles.forEach((article, index) => {
      const title = String(article.title || '').trim();
      const summary = String(article.summary || '').trim();
      const content = String(article.content || '').trim();
      const hanCharacters = (content.match(/\p{Script=Han}/gu) || []).length;
      if (!title || !summary || hanCharacters < 800 || hanCharacters > 1500) {
        rejected.push({ title: title || '(missing title)', hanCharacters, reason: 'length' });
        return;
      }
      if (titleSet.has(title) || batchTitles.has(title)) {
        rejected.push({ title, hanCharacters, reason: 'duplicate-title' });
        return;
      }
      batchTitles.add(title);
      const articlePlanIndex = already + results[slug].published + rows.length;
      rows.push({
        id: crypto.randomUUID(),
        title,
        slug: articleSlug(title),
        summary,
        content,
        category_name: `${topicPrefix(topicName)}${angles[index]}`,
        status: 'published',
        visibility: 'public',
        author: '唐人日报编辑部',
        metadata: {
          immigration_category: category.name,
          immigration_topic: topicName,
          writing_angle: angles[index],
          daily_plan_date: publicationDate,
          daily_plan_slot: publicationSlot(articlePlanIndex)?.label,
          daily_plan_order: articlePlanIndex + 1,
          official_source_url: topicName === '政治庇护' ? ASYLUM_OFFICIAL_SOURCE : null,
          generated_by: 'immigration-knowledge-daily'
        },
        published_at: new Date().toISOString()
      });
    });

    if (rejected.length) {
      console.warn(`[knowledge] ${category.name}/${topicName} rejected ${rejected.length}/${articles.length} in round ${round}: ${JSON.stringify(rejected)}`);
    }

    if (rows.length) {
      const inserted = await sb('articles', { method: 'POST', body: JSON.stringify(rows) });
      for (const row of inserted || rows) {
        titleSet.add(String(row.title || '').trim());
        recent.push(row);
      }
      totalPublished += rows.length;
      results[slug].published += rows.length;
      console.log(`[knowledge] ${category.name}/${topicName} published ${rows.length}, round ${round}`);
    }

    missing = Math.max(0, plannedTarget - recentTopicCount(topicName));
    angleOffset += angles.length;
  }

  results[slug].after = recentTopicCount(topicName);
  if (results[slug].after < plannedTarget) {
    throw new Error(`${category.name}/${topicName} remains ${results[slug].after}/${plannedTarget} for ${publicationDate}`);
  }
}

console.log(JSON.stringify({
  category: categoryKey,
  category_name: category.name,
  publication_date_new_york: publicationDate,
  daily_target_per_topic: targetPerTopic,
  planned_target_now: plannedTarget,
  topic_count: Object.keys(category.topics).length,
  total_published: totalPublished,
  results
}, null, 2));
