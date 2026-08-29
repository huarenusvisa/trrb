import iceClassifier from '../netlify/functions/_shared/ice-enforcement.js';

const { isIceEnforcementText } = iceClassifier;

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const APPLY = String(process.env.APPLY_CHANGES || 'false').toLowerCase() === 'true'
  && String(process.env.APPLY_CONFIRMATION || '') === 'APPLY';
const STRICT = String(process.env.STRICT_CLEANUP || 'false').toLowerCase() === 'true';

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const SOURCE_CATEGORIES = new Set([
  '移民美国', '赴美留学', '移民新闻', '美国移民', '移民资讯',
  'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报'
]);

// Exact recovery list for legitimate immigration stories moved by an earlier,
// overly strict cleanup. Do not broaden the scan to all politics/crime articles.
const RECOVERY_IDS = new Set([
  'bc507842-cdd9-4231-b5e6-d64c3a831b34', // TPS termination ruling
  '1e48770a-cd37-4008-9e88-7f40229337f3', // asylum interview interpreter
  '99de2253-e577-4c52-9d3e-f8e643e2a656'  // religious asylum credibility
]);

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[‐‑‒–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const hasAny = (text, terms) => terms.some((term) => text.includes(normalize(term)));

const immigrationTerms = [
  '签证', '绿卡', '入籍', '公民申请', '移民申请', '美国移民政策', '合法移民', '移民配额', '移民签证',
  'uscis', '美国公民及移民服务局', '移民局', '移民法庭', '移民法官', '赴美', '入境美国',
  '庇护', '临时保护身份', '身份转换', '调整身份',
  'f-1', 'f1学生', 'j-1', 'm-1', 'cpt', 'opt', 'stem opt', 'i-20', 'sevis',
  'h-1b', 'l-1', 'o-1', 'h-2a', 'h-2b', 'tn签证', 'e-1', 'e-2', 'r-1',
  'eb-1', 'eb1', 'eb-2', 'eb2', 'niw', 'perm', 'eb-3', 'eb3', 'eb-4', 'eb4', 'eb-5', 'eb5',
  '婚姻绿卡', '婚绿', 'f2a', 'k-1', 'cr-1', 'ir-1', 'i-130', 'i-485', 'i-864', 'ds-260', 'nvc',
  '政治庇护', '庇护申请', 'i-589', 'vawa', 'u签证', 't签证', 'sijs', 'tps',
  'n-400', 'n400', 'n-600', 'n600', '工卡', 'ead', 'advance parole', '回美证',
  'bia', '移民上诉委员会', '移民判例', '212(h)', 'employment authorization',
  'work permit', 'travel document', 'adjustment of status'
];

const policeTerms = [
  '警方', '警察', '警局', '警员', '逮捕', '被捕', '拘捕', '枪击', '刺伤', '命案',
  '车祸', '酒驾', '醉驾', '肇事', '盗窃', '抢劫', '诈骗', '纵火', '起诉', '刑事指控',
  '法院判刑', '判处', '嫌疑人', '检方', '联邦检察官'
];

const politicsTerms = [
  '特朗普', '白宫', '国会', '参议院', '众议院', '州长', '总统', '国务卿', '国土安全部',
  '司法部', '联邦法院', '最高法院', '上诉法院', '行政命令', '政府政策', '移民政策',
  '签证政策', '边境政策', '法案', '听证会', '政府宣布', '政府重启', '政策调整'
];

const importantTerms = [
  '重大', '突发', '全国', '全美', '紧急状态', '战争', '袭击', '灾难', '地震', '洪水',
  '大规模', '历史性', '破纪录', '重大裁决'
];

const hardRejectTerms = [
  '成都', '四川', '安徽', '河南', '河北', '山东', '福建', '广西', '江西', '湖北', '湖南',
  '派出所副所长', '纪委监委', '开除党籍', '受贿', '酒店偷拍视频', '针孔摄像头',
  '中东战云', 'f-16', 'f-35', '导弹', '战机'
];

function classify(row) {
  const title = normalize(row.title);
  const summary = normalize(row.summary);
  const lead = normalize(row.content).slice(0, 1200);
  const primary = `${title} ${summary}`;
  const topical = `${primary} ${lead}`;

  // ICE requires two independent headline/summary signals: the ICE agency itself
  // and a concrete enforcement action. A substring such as service/practice/notice
  // must never be treated as the standalone acronym ICE.
  if (isIceEnforcementText(title, summary)) {
    return { action: 'move', category: 'ICE执法动态', reason: 'explicit ICE agency + enforcement action' };
  }

  if (hasAny(primary, immigrationTerms)) return { action: 'keep', category: '移民美国', reason: 'genuine immigration-to-US topic' };

  if (hasAny(topical, politicsTerms)) return { action: 'move', category: '美国时政', reason: 'US politics/policy/court' };
  if (hasAny(topical, policeTerms)) return { action: 'move', category: '美国警情', reason: 'US crime/police/court' };
  if (hasAny(topical, importantTerms)) return { action: 'move', category: '热门头条', reason: 'major general news' };

  // Misclassification cleanup must preserve articles. Anything that cannot be
  // proven to be about immigrating to the United States leaves this section.
  if (hasAny(topical, hardRejectTerms)) return { action: 'move', category: '热门头条', reason: 'unrelated to US immigration' };
  return { action: 'move', category: '热门头条', reason: 'not proven to be immigration-to-US content' };
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  return response;
}

async function fetchPublishedArticles() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const select = encodeURIComponent('id,title,summary,content,category_name,status,published_at');
    const response = await request(`articles?select=${select}&status=eq.published&order=published_at.desc.nullslast`, {
      headers: { Range: `${from}-${from + pageSize - 1}`, Prefer: 'count=exact' }
    });
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function fetchCategoryMap() {
  const response = await request(`categories?select=${encodeURIComponent('id,name')}&is_active=eq.true&limit=500`);
  const rows = await response.json();
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.name || '').trim(), row]));
}

async function patchCategory(id, category, categories) {
  const target = categories.get(category);
  if (!target?.id) throw new Error(`找不到目标栏目：${category}`);
  await request(`articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      category_id: target.id,
      category_name: target.name,
      topic_key: category === 'ICE执法动态' ? 'ice' : null
    })
  });
}

async function deleteArticle(id) {
  await request(`articles?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const all = await fetchPublishedArticles();
const categories = await fetchCategoryMap();
const targets = all.filter((row) => SOURCE_CATEGORIES.has(String(row.category_name || '').trim()) || RECOVERY_IDS.has(String(row.id || '')));
const summary = { scanned: targets.length, kept: 0, moved: 0, deleted: 0, failed: 0 };

console.log(`Found ${targets.length} published immigration-category articles. APPLY_CHANGES=${APPLY}`);

for (const row of targets) {
  const result = classify(row);
  const current = String(row.category_name || '').trim();
  try {
    if (result.action === 'keep') {
      if (APPLY && current !== '移民美国') await patchCategory(row.id, '移民美国', categories);
      summary.kept += 1;
    } else if (result.action === 'move') {
      if (APPLY && current !== result.category) await patchCategory(row.id, result.category, categories);
      summary.moved += 1;
    } else {
      if (APPLY) await deleteArticle(row.id);
      summary.deleted += 1;
    }
    console.log(JSON.stringify({ id: row.id, title: row.title, from: current, ...result }));
  } catch (error) {
    summary.failed += 1;
    console.error(JSON.stringify({ id: row.id, title: row.title, error: String(error) }));
  }
}

console.log('SUMMARY', JSON.stringify(summary));
if (summary.failed && STRICT) process.exitCode = 1;
