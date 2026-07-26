const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const APPLY = String(process.env.APPLY_CHANGES || 'true').toLowerCase() === 'true';

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const SOURCE_CATEGORIES = new Set([
  '移民美国', '赴美留学', '移民新闻', '美国移民', '移民资讯'
]);

const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[‐‑‒–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const hasAny = (text, terms) => terms.some((term) => text.includes(normalize(term)));

const immigrationTerms = [
  '移民', '签证', '绿卡', '入籍', '公民申请', '身份转换', '调整身份',
  'f-1', 'f1学生', 'j-1', 'm-1', 'cpt', 'opt', 'stem opt', 'i-20', 'sevis',
  'h-1b', 'l-1', 'o-1', 'h-2a', 'h-2b', 'tn签证', 'e-1', 'e-2', 'r-1',
  'eb-1', 'eb1', 'eb-2', 'eb2', 'niw', 'perm', 'eb-3', 'eb3', 'eb-4', 'eb4', 'eb-5', 'eb5',
  '婚姻绿卡', '婚绿', 'f2a', 'k-1', 'cr-1', 'ir-1', 'i-130', 'i-485', 'i-864', 'ds-260', 'nvc',
  '政治庇护', '庇护申请', 'i-589', 'vawa', 'u签证', 't签证', 'sijs', 'tps',
  'n-400', 'n400', 'n-600', 'n600', '工卡', 'ead', 'advance parole', '回美证'
];

const iceTerms = [
  'ice', '移民与海关执法局', '移民执法', '执法突袭', '移民拘留', '拘留中心', '遣返',
  '递解', '驱逐出境', '无证移民', '非法移民', '庇护城市', '287(g)', 'detainer',
  '移民监狱', '拘押移民', '移民执法人员'
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
  const content = normalize(row.content).slice(0, 5000);
  const text = `${title} ${summary} ${content}`;

  // ICE has priority because many ICE stories also contain police, court and policy terms.
  if (hasAny(text, iceTerms)) return { action: 'move', category: 'ICE执法动态', reason: 'ICE enforcement/detention/removal' };

  // Genuine immigration knowledge or immigration-process reporting stays in the immigration hub.
  if (hasAny(text, immigrationTerms)) return { action: 'keep', category: '移民美国', reason: 'genuine immigration topic' };

  if (hasAny(text, politicsTerms)) return { action: 'move', category: '美国时政', reason: 'US politics/policy/court' };
  if (hasAny(text, policeTerms)) return { action: 'move', category: '美国警情', reason: 'US crime/police/court' };
  if (hasAny(text, importantTerms)) return { action: 'move', category: '重要新闻', reason: 'major general news' };

  if (hasAny(text, hardRejectTerms)) return { action: 'delete', reason: 'clearly unrelated to US immigration sections' };
  return { action: 'delete', reason: 'cannot be reliably classified' };
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

async function patchCategory(id, category) {
  await request(`articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_name: category })
  });
}

async function deleteArticle(id) {
  await request(`articles?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const all = await fetchPublishedArticles();
const targets = all.filter((row) => SOURCE_CATEGORIES.has(String(row.category_name || '').trim()));
const summary = { scanned: targets.length, kept: 0, moved: 0, deleted: 0, failed: 0 };

console.log(`Found ${targets.length} published immigration-category articles. APPLY_CHANGES=${APPLY}`);

for (const row of targets) {
  const result = classify(row);
  const current = String(row.category_name || '').trim();
  try {
    if (result.action === 'keep') {
      summary.kept += 1;
      if (APPLY && current !== '移民美国') await patchCategory(row.id, '移民美国');
    } else if (result.action === 'move') {
      summary.moved += 1;
      if (APPLY && current !== result.category) await patchCategory(row.id, result.category);
    } else {
      summary.deleted += 1;
      if (APPLY) await deleteArticle(row.id);
    }
    console.log(JSON.stringify({ id: row.id, title: row.title, from: current, ...result }));
  } catch (error) {
    summary.failed += 1;
    console.error(JSON.stringify({ id: row.id, title: row.title, error: String(error) }));
  }
}

console.log('SUMMARY', JSON.stringify(summary));
if (summary.failed) process.exitCode = 1;
