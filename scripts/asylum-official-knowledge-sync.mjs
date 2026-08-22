import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIMIT = Math.max(1, Math.min(30, Number(process.env.ASYLUM_OFFICIAL_SYNC_LIMIT || 12)));
const UA = 'TRRB-Asylum-Official-Knowledge/1.0 (+https://trrb.net/asylumjudge)';

const USCIS_SEEDS = [
  'https://www.uscis.gov/humanitarian/refugees-and-asylum/asylum',
  'https://www.uscis.gov/humanitarian/refugees-and-asylum/asylum/obtaining-asylum-in-the-united-states'
];
const ALLOWED = /race|racial|religion|religious|nationality|political opinion|imputed political|particular social group|protected ground|past persecution|future persecution|well-founded fear|unable or unwilling|government protection|nexus|mixed motive|种族|宗教|国籍|政治观点|特定社会群体|过去迫害|未来迫害|政府.{0,8}(无法|不愿).{0,8}保护|因果联系/i;
const EXCLUDED = /advance parole|employment authorization|EAD|C0?8|filing fee|green card|family petition|bond|detention|Convention Against Torture|\bCAT\b|withholding of removal|旅行许可|工卡|费用|绿卡|家属|保释|拘留|禁止酷刑|防止递解/i;

export function isAllowedAsylumText(value) {
  const text = String(value || '');
  return ALLOWED.test(text) && !EXCLUDED.test(text);
}

function containsAsylumGrounds(value) {
  return ALLOWED.test(String(value || ''));
}

if (process.argv.includes('--self-test')) {
  const accepted = ['religious persecution and government unwilling to protect', '特定社会群体与未来迫害恐惧'];
  const rejected = ['C08 EAD filing fee', 'CAT and withholding of removal', 'Advance Parole family travel'];
  if (!accepted.every(isAllowedAsylumText) || rejected.some(isAllowedAsylumText)) throw new Error('asylum scope self-test failed');
  console.log('PASS asylum official knowledge scope self-test');
  process.exit(0);
}

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing OPENAI_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const clean = (value = '') => String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const slugify = (value) => String(value).normalize('NFKC').toLowerCase().replace(/[\s/\\|]+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 82);

async function fetchOk(url, accept = 'text/html,*/*;q=0.8') {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

async function supabase(endpoint, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function modelOutput(data) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';
}

async function analyze(source) {
  const prompt = `你是美国庇护法官方资料编辑。仅根据下列官方原文生成中文知识条目，不得补充原文没有的事实。\n\n纳入范围仅限：种族、宗教、国籍、政治观点、特定社会群体；过去/未来迫害；政府无法或不愿保护；迫害者；受保护理由与迫害的因果联系或混合动机。\n排除：仅涉及I-589程序、期限或费用、C08/EAD工卡、Advance Parole、家属、绿卡、拘留/保释、CAT或防止递解的资料。\nBIA资料只有在正文直接处理上述纳入范围时才 relevant=true；必须从判决正文提取准确 Matter of 案名、I&N Dec. 引证和裁判要点，不得信赖网页旁注。\nUSCIS资料不得写成个案裁决。confidence表示无需人工判断即可准确发布的把握；原文含糊、适用范围不明、可能被后续裁决修改或无法确认当前效力时必须低于0.9，并在review_reason中说明。\n正文用简洁小标题，700至1100字；说明这是一般信息而非法律意见，并列出官方原文链接。\n\n来源类型：${source.type}\n官方网址：${source.url}\n官方原文：\n${source.text.slice(0, 60000)}`;
  const schema = { type: 'object', additionalProperties: false, required: ['relevant', 'confidence', 'review_reason', 'topic', 'citation', 'title', 'summary', 'content'], properties: {
    relevant: { type: 'boolean' }, confidence: { type: 'number', minimum: 0, maximum: 1 }, review_reason: { type: 'string' }, topic: { type: 'string' }, citation: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' }
  } };
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: OPENAI_MODEL, input: prompt, max_output_tokens: 5000, text: { format: { type: 'json_schema', name: 'official_asylum_knowledge', strict: true, schema } } }), signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  return JSON.parse(modelOutput(await response.json()));
}

async function discoverUscis() {
  const urls = new Set(USCIS_SEEDS);
  const hub = await fetchOk(USCIS_SEEDS[0]);
  const html = await hub.text();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], hub.url);
      if (url.hostname === 'www.uscis.gov' && /\/humanitarian\/refugees-and-asylum\/asylum(?:\/|$)/i.test(url.pathname)) {
        url.hash = ''; url.search = ''; urls.add(url.toString().replace(/\/$/, ''));
      }
    } catch { /* malformed page link */ }
  }
  const sources = [];
  for (const url of [...urls].slice(0, 12)) {
    try {
      const response = await fetchOk(url);
      const text = clean(await response.text());
      if (containsAsylumGrounds(text)) sources.push({ type: 'uscis_guidance', url: response.url, text });
    } catch (error) { console.warn(`[USCIS] skip ${url}: ${error.message}`); }
  }
  return sources;
}

async function pdfText(url) {
  const response = await fetchOk(url, 'application/pdf,*/*;q=0.8');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bia-asylum-'));
  const pdf = path.join(dir, 'decision.pdf');
  const txt = path.join(dir, 'decision.txt');
  try {
    await fs.writeFile(pdf, Buffer.from(await response.arrayBuffer()));
    await execFileAsync('pdftotext', ['-layout', pdf, txt], { timeout: 45000 });
    return await fs.readFile(txt, 'utf8');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function discoverBia(existingKeys = new Set()) {
  const data = JSON.parse(await fs.readFile('data/legal/bia-precedent-latest.json', 'utf8'));
  const sources = [];
  for (const item of [...(data.decisions || [])].sort((a, b) => Number(b.reporterPage) - Number(a.reporterPage))) {
    if (existingKeys.has(hash(item.officialPdfUrl))) continue;
    if (sources.length >= LIMIT * 3) break;
    try {
      const text = await pdfText(item.officialPdfUrl);
      if (containsAsylumGrounds(text)) sources.push({ type: 'bia_precedent', url: item.officialPdfUrl, text });
    } catch (error) { console.warn(`[BIA] skip page ${item.reporterPage}: ${error.message}`); }
  }
  return sources;
}

const existing = await supabase(`articles?select=id,title,metadata&category_name=like.${encodeURIComponent('移民美国·人道主义庇护·政治庇护·*')}&limit=5000`);
const byKey = new Map((existing || []).map(row => [row.metadata?.official_source_key, row]).filter(([key]) => key));
const sources = [...await discoverUscis(), ...await discoverBia(new Set(byKey.keys()))];
let processed = 0, published = 0, updated = 0, skipped = 0;

for (const source of sources) {
  if (processed >= LIMIT) break;
  const sourceKey = hash(source.url);
  const fingerprint = hash(clean(source.text));
  const prior = byKey.get(sourceKey);
  if (prior?.metadata?.official_source_fingerprint === fingerprint) { skipped += 1; continue; }
  processed += 1;
  const item = await analyze(source);
  if (!item.relevant || !isAllowedAsylumText(`${item.title} ${item.summary} ${item.content}`)) { skipped += 1; continue; }
  const isBia = source.type === 'bia_precedent';
  const label = isBia ? 'BIA先例判决' : 'USCIS官方知识';
  const needsReview = isBia || Number(item.confidence) < 0.9;
  const title = `[${isBia ? 'BIA先例' : 'USCIS官方'}] ${String(item.title).replace(/^\[[^\]]+\]\s*/, '')}`;
  const row = {
    title,
    slug: `${slugify(title) || 'asylum-official'}-${sourceKey.slice(0, 10)}`,
    summary: item.summary,
    content: `${item.content}\n\n官方原文：${source.url}${item.citation ? `\n官方引证：${item.citation}` : ''}\n\n本文为一般信息，不构成针对个案的法律意见。`,
    category_name: `移民美国·人道主义庇护·政治庇护·${label}`,
    status: needsReview ? 'draft' : 'published', visibility: needsReview ? 'private' : 'public', author: '唐人日报编辑部', published_at: needsReview ? null : new Date().toISOString(),
    metadata: { official_source_key: sourceKey, official_source_fingerprint: fingerprint, official_url: source.url, source_type: source.type, citation: item.citation, asylum_topic: item.topic, confidence: item.confidence, review_reason: item.review_reason, review_status: needsReview ? 'pending_review' : 'auto_published', generated_by: 'asylum-official-knowledge-sync' }
  };
  if (prior) {
    await supabase(`articles?id=eq.${encodeURIComponent(prior.id)}`, { method: 'PATCH', body: JSON.stringify(row) }); updated += 1;
  } else {
    await supabase('articles', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), ...row }) }); published += 1;
  }
}

console.log(JSON.stringify({ discovered: sources.length, processed, published, updated, skipped, scope: 'official USCIS and published BIA precedent decisions; five protected grounds and persecution elements only' }, null, 2));
