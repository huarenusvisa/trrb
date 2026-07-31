import fs from 'node:fs/promises';

const categoryKey = process.argv[2];
const targetPerTopic = Math.max(
  1,
  Math.min(20, Number(process.env.KNOWLEDGE_ARTICLES_PER_TOPIC || process.env.KNOWLEDGE_ARTICLES_PER_CATEGORY || 10))
);
const windowHours = Math.max(24, Number(process.env.KNOWLEDGE_HEALTH_WINDOW_HOURS || 30));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_OUTPUT_TOKENS = Math.max(8000, Number(process.env.KNOWLEDGE_BATCH_MAX_OUTPUT_TOKENS || 20000));

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
  const prompt = `你是唐人日报“移民美国”专业知识库编辑。请为“${category.name} / ${topicName}”一次生成${angles.length}篇彼此独立的中文知识文章。\n\n每篇文章必须严格对应下面同序号的写作角度，不能合并、遗漏或重复：\n${numberedAngles}\n\n统一要求：\n1. 每篇标题准确、专业、不夸张，标题之间不得近似；\n2. 每篇摘要80至120个汉字；\n3. 每篇正文900至1400个汉字，使用清晰小标题；\n4. 结合对应角度解释适用人群、资格、流程、材料、时间节点、风险和常见误区；\n5. 不编造最新费用、处理时间、排期、配额或政策数字；涉及会变化的信息，明确提示以USCIS、美国国务院或主管机关最新规则为准；\n6. 保持中立、写实，不构成法律意见；\n7. 每篇必须自然出现专题名“${topicName}”；\n8. 不得复用以下近期标题：\n${avoid || '- 无'}\n9. 仅返回符合JSON Schema的结果，articles数组顺序必须与写作角度顺序一致。`;

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
        })
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

const cutoff = new Date(Date.now() - windowHours * 3600000).toISOString();
const recent = await sb(
  `articles?select=title,category_name,published_at&status=eq.published&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=3000`
);
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
  const already = recentTopicCount(topicName);
  let missing = Math.max(0, targetPerTopic - already);
  results[slug] = { topic: topicName, before: already, requested: missing, published: 0 };

  if (!missing) {
    console.log(`[knowledge] ${category.name}/${topicName} already meets ${targetPerTopic}`);
    continue;
  }

  const pool = anglePool(slug, topicName);
  let angleOffset = already;

  for (let round = 1; round <= 3 && missing > 0; round += 1) {
    const angles = Array.from({ length: missing }, (_, index) => pool[(angleOffset + index) % pool.length]);
    const articles = await generateBatch(topicName, angles, [...titleSet]);
    const rows = [];
    const batchTitles = new Set();

    articles.forEach((article, index) => {
      const title = String(article.title || '').trim();
      const summary = String(article.summary || '').trim();
      const content = String(article.content || '').trim();
      if (!title || !summary || content.length < 500) return;
      if (titleSet.has(title) || batchTitles.has(title)) return;
      batchTitles.add(title);
      rows.push({
        title,
        summary,
        content,
        category_name: `${topicPrefix(topicName)}${angles[index]}`,
        status: 'published',
        published_at: new Date().toISOString()
      });
    });

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

    missing = Math.max(0, targetPerTopic - recentTopicCount(topicName));
    angleOffset += angles.length;
  }

  results[slug].after = recentTopicCount(topicName);
  if (results[slug].after < targetPerTopic) {
    throw new Error(`${category.name}/${topicName} remains ${results[slug].after}/${targetPerTopic}`);
  }
}

console.log(JSON.stringify({
  category: categoryKey,
  category_name: category.name,
  expected_per_topic: targetPerTopic,
  topic_count: Object.keys(category.topics).length,
  total_published: totalPublished,
  results
}, null, 2));
