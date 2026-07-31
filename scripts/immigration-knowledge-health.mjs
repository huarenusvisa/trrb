import { spawn } from 'node:child_process';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WINDOW_HOURS = Math.max(24, Number(process.env.KNOWLEDGE_HEALTH_WINDOW_HOURS || 30));
const EXPECTED_PER_TOPIC = Math.max(
  1,
  Number(process.env.KNOWLEDGE_ARTICLES_PER_TOPIC || process.env.KNOWLEDGE_ARTICLES_PER_CATEGORY || 10)
);

const categories = {
  study: { name: '赴美留学', topics: ['F-1学生签证', 'J-1交流访问', 'M-1职业学生', 'CPT', 'OPT', 'STEM OPT', 'Day 1 CPT'] },
  work: { name: '赴美工作', topics: ['H-1B专业工作', 'L-1跨国公司派遣', 'O-1杰出人才', 'H-2A农业工', 'H-2B临时工', 'TN专业人士', 'E-1/E-2商业签证', 'R-1宗教工作者'] },
  employment: { name: '职业移民', topics: ['EB-1A杰出人才', 'EB-1B教授研究员', 'EB-1C跨国高管', 'EB-2 NIW', 'EB-2 PERM', 'EB-3', 'EB-4', 'EB-5投资移民'] },
  family: { name: '家庭移民', topics: ['美国公民婚姻绿卡', '绿卡配偶F2A', 'K-1未婚夫/妻', '父母移民', '子女移民', '兄弟姐妹移民', 'CR-1/IR-1配偶移民', 'F1/F2B/F3/F4优先类别'] },
  humanitarian: { name: '人道主义庇护', topics: ['政治庇护', '防止递解', '禁止酷刑公约保护', 'VAWA家暴保护', 'U签证', 'T签证', 'SIJS特殊青少年', 'TPS临时保护身份'] },
  'change-status': { name: '境内身份转换', topics: ['B-2转F-1', 'F-1转H-1B', 'J-1豁免', '身份延期', '身份恢复', 'I-485境内调整身份', 'EAD工卡', 'Advance Parole旅行许可'] },
  citizenship: { name: '入籍美国公民', topics: ['N-400入籍申请', '连续居住', '实际居住', '英语与公民考试', '入籍面试', '入籍宣誓', 'N-600公民证明', '衍生与取得公民'] }
};

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase environment');

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json'
};

async function fetchRecentRows() {
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600000).toISOString();
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set('select', 'category_name,published_at');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('published_at', `gte.${cutoff}`);
  url.searchParams.set('category_name', 'like.移民美国·*');
  url.searchParams.set('order', 'published_at.desc');
  url.searchParams.set('limit', '3000');
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function buildSnapshot(rows) {
  const result = {};
  for (const [categoryKey, category] of Object.entries(categories)) {
    result[categoryKey] = {};
    for (const topic of category.topics) {
      const prefix = `移民美国·${category.name}·${topic}·`;
      result[categoryKey][topic] = rows.filter(row => String(row.category_name || '').startsWith(prefix)).length;
    }
  }
  return result;
}

function runGenerator(categoryKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/immigration-knowledge-daily.mjs', categoryKey], {
      stdio: 'inherit',
      env: {
        ...process.env,
        KNOWLEDGE_ARTICLES_PER_TOPIC: String(EXPECTED_PER_TOPIC),
        KNOWLEDGE_HEALTH_WINDOW_HOURS: String(WINDOW_HOURS)
      }
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${categoryKey} generator exited ${code}`)));
  });
}

const before = buildSnapshot(await fetchRecentRows());
const categoriesNeedingRepair = Object.entries(before)
  .filter(([, topics]) => Object.values(topics).some(count => count < EXPECTED_PER_TOPIC))
  .map(([categoryKey]) => categoryKey);

if (categoriesNeedingRepair.length) {
  console.warn(`[knowledge-health] repairing categories: ${categoriesNeedingRepair.join(', ')}`);
  const repairResults = await Promise.allSettled(categoriesNeedingRepair.map(runGenerator));
  const failures = repairResults
    .map((result, index) => ({ result, category: categoriesNeedingRepair[index] }))
    .filter(item => item.result.status === 'rejected');
  if (failures.length) {
    throw new Error(`Repair generators failed: ${failures.map(item => `${item.category}: ${item.result.reason?.message || item.result.reason}`).join('; ')}`);
  }
}

const after = buildSnapshot(await fetchRecentRows());
const stillMissing = [];
for (const [categoryKey, topics] of Object.entries(after)) {
  for (const [topic, count] of Object.entries(topics)) {
    if (count < EXPECTED_PER_TOPIC) stillMissing.push(`${categoryKey}/${topic}=${count}/${EXPECTED_PER_TOPIC}`);
  }
}

const totalTopics = Object.values(categories).reduce((sum, category) => sum + category.topics.length, 0);
console.log(JSON.stringify({
  window_hours: WINDOW_HOURS,
  expected_per_topic: EXPECTED_PER_TOPIC,
  total_topics: totalTopics,
  expected_total: totalTopics * EXPECTED_PER_TOPIC,
  repaired_categories: categoriesNeedingRepair,
  before,
  after
}, null, 2));

if (stillMissing.length) {
  throw new Error(`Knowledge topics still below target: ${stillMissing.join(', ')}`);
}
