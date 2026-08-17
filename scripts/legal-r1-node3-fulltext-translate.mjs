import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const RECORD_BATCH = Math.max(1, Math.min(24, Number(process.env.LEGAL_R1_N3_RECORD_BATCH || 6)));
const CHUNK_CHARS = Math.max(6000, Math.min(26000, Number(process.env.LEGAL_R1_N3_CHUNK_CHARS || 18000)));
const DB_PATH = 'data/legal/unified-legal-authorities-latest.json';
const OUT_DIR = 'data/legal/fulltext-zh';
const INDEX_PATH = 'data/legal/legal-fulltext-zh-index.json';

if (!KEY) throw new Error('Missing OPENAI_API_KEY');
fs.mkdirSync(OUT_DIR, { recursive: true });

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const records = Array.isArray(db.records) ? db.records : [];
const eligible = records.filter(r => r?.officialPdfUrl || r?.officialUrl);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function recordFingerprint(record) {
  return sha256(JSON.stringify({
    id: record.id,
    sourceSystem: record.sourceSystem || null,
    authorityType: record.authorityType || null,
    issuingBody: record.issuingBody || null,
    title: record.title || null,
    docket: record.docket || null,
    citation: record.citation || null,
    publicationDate: record.publicationDate || null,
    officialUrl: record.officialUrl || null,
    officialPdfUrl: record.officialPdfUrl || null
  }));
}

function outputText(data) {
  if (data?.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (c?.type === 'output_text' && c?.text) return c.text;
    }
  }
  return '';
}

function outPath(recordId) {
  return path.join(OUT_DIR, `${recordId}.json`);
}

function readExisting(record) {
  const file = outPath(record.id);
  if (!fs.existsSync(file)) return null;
  try {
    let x = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (x?.recordId !== record.id) return null;
    if (x?.recordFingerprint !== recordFingerprint(record)) return null;
    if (String(x?.officialUrl || '') !== String(record.officialUrl || '')) return null;
    if (String(x?.officialPdfUrl || '') !== String(record.officialPdfUrl || '')) return null;
    if (!Array.isArray(x?.segments) || !x.segments.length) return null;
    if (x.segments.some((s, i) => !s.segmentId || s.order !== i + 1 || !s.sourceTextHash || !String(s.chineseText || '').trim())) return null;
    if (x.sourceSegmentCount !== x.segments.length || x.translatedSegmentCount !== x.segments.length) return null;
    if (x.datasetVersion !== db.datasetVersion) {
      x = { ...x, datasetVersion: db.datasetVersion, reboundAt: new Date().toISOString() };
      fs.writeFileSync(file, JSON.stringify(x, null, 2) + '\n');
    }
    return x;
  } catch {
    return null;
  }
}

function extractRecord(record) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-r1-n3-'));
  const proc = spawnSync(process.execPath, [
    'scripts/legal-r1-node2-extract-official-source.mjs',
    '--record-id', record.id,
    '--output', tmp
  ], { encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  if (proc.status !== 0) throw new Error(`N2 extractor failed for ${record.id}: ${(proc.stderr || proc.stdout || '').slice(0, 1200)}`);
  const file = path.join(tmp, `${record.id}.json`);
  if (!fs.existsSync(file)) throw new Error(`N2 extractor did not produce ${record.id}.json`);
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (x.status !== 'EXTRACTED' || !Array.isArray(x.segments) || !x.segments.length) {
    throw new Error(`N2 verified structure unavailable for ${record.id}: status=${x.status}`);
  }
  return x;
}

function chunkSegments(segments) {
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const segment of segments) {
    const size = String(segment.text || '').length;
    if (current.length && chars + size > CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(segment);
    chars += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function translateChunk(record, chunk, chunkIndex, chunkCount) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['translations'],
    properties: {
      translations: {
        type: 'array',
        minItems: chunk.length,
        maxItems: chunk.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['segmentId', 'chineseText'],
          properties: {
            segmentId: { type: 'string' },
            chineseText: { type: 'string' }
          }
        }
      }
    }
  };

  const payload = chunk.map(s => ({
    segmentId: s.segmentId,
    order: s.order,
    page: s.page ?? null,
    type: s.type || 'paragraph',
    text: s.text
  }));

  const prompt = `你是美国法律官方原文的专业中文全文翻译器。你的任务不是摘要、不是改写、不是法律评论，而是逐段完整翻译。\n\n硬规则：\n1. 只翻译输入中提供的官方原文，不添加任何原文不存在的事实、解释、背景或结论。\n2. 每个 segmentId 必须恰好返回一次，顺序不得改变，不得遗漏、合并或拆分段落。\n3. chineseText 必须完整覆盖该段原文的全部实质内容，包括标题、脚注文字、案号、引证、日期、数字、当事人称谓、法条、裁判结论、命令性语句和限定语。\n4. 法律专有名词应准确、稳定；必要时可在中文后保留英文原词，但不得用解释替代翻译。\n5. 不得把“may / could / alleged / according to”等限定语翻成确定事实；不得把不同法律主体、程序阶段或裁判结果混淆。\n6. 原文若存在格式噪声，只忠实翻译可识别文字；不得自行补全文字。\n7. 不得输出摘要、免责声明、注释或额外字段。\n\n记录绑定：${JSON.stringify({recordId: record.id, sourceSystem: record.sourceSystem, title: record.title || null, docket: record.docket || null, citation: record.citation || null, chunk: `${chunkIndex + 1}/${chunkCount}`})}\n\n待逐段翻译的官方原文 JSON：\n${JSON.stringify(payload)}\n\n只返回符合 schema 的 JSON。`;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          input: prompt,
          max_output_tokens: 12000,
          text: { format: { type: 'json_schema', name: 'legal_fulltext_translation', strict: true, schema } }
        }),
        signal: AbortSignal.timeout(180000)
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${raw.slice(0, 700)}`);
      const parsed = JSON.parse(outputText(JSON.parse(raw)) || '{}');
      const translations = parsed.translations;
      if (!Array.isArray(translations) || translations.length !== chunk.length) throw new Error('translation count mismatch');
      const expected = chunk.map(s => s.segmentId);
      const actual = translations.map(t => t.segmentId);
      if (actual.some((id, i) => id !== expected[i])) throw new Error('segmentId/order mismatch');
      if (translations.some(t => !String(t.chineseText || '').trim())) throw new Error('empty Chinese translation');
      return translations;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError || new Error('translation failed');
}

async function translateRecord(record) {
  const source = extractRecord(record);
  const chunks = chunkSegments(source.segments);
  const translated = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const result = await translateChunk(record, chunks[i], i, chunks.length);
    for (const item of result) translated.set(item.segmentId, item.chineseText);
  }
  if (translated.size !== source.segments.length) throw new Error(`record segment coverage mismatch ${translated.size}/${source.segments.length}`);

  const segments = source.segments.map((s, i) => ({
    segmentId: s.segmentId,
    order: i + 1,
    page: s.page ?? null,
    type: s.type || 'paragraph',
    sourceTextHash: sha256(s.text),
    chineseText: translated.get(s.segmentId)
  }));

  const sourceDigest = sha256(source.segments.map(s => `${s.segmentId}\u0000${s.text}`).join('\u0001'));
  const result = {
    schemaVersion: 1,
    recordId: record.id,
    recordFingerprint: recordFingerprint(record),
    datasetVersion: db.datasetVersion,
    sourceSystem: record.sourceSystem,
    authorityType: record.authorityType || null,
    issuingBody: record.issuingBody || null,
    officialUrl: record.officialUrl || null,
    officialPdfUrl: record.officialPdfUrl || null,
    sourceUrl: source.sourceUrl,
    sourceFormat: source.sourceFormat,
    extractionMethod: source.extractionMethod,
    sourceExtractedAt: source.extractedAt,
    sourceDigest,
    translatedAt: new Date().toISOString(),
    model: MODEL,
    translationMode: 'complete-segment-preserving-official-source-translation',
    sourceSegmentCount: source.segments.length,
    translatedSegmentCount: segments.length,
    segments
  };
  fs.writeFileSync(outPath(record.id), JSON.stringify(result, null, 2) + '\n');
  return result;
}

const existing = new Map();
for (const record of eligible) {
  const x = readExisting(record);
  if (x) existing.set(record.id, x);
}

const pending = eligible.filter(r => !existing.has(r.id));
const selected = pending.slice(0, RECORD_BATCH);
const failures = [];
let translatedNow = 0;

for (const record of selected) {
  try {
    const result = await translateRecord(record);
    existing.set(record.id, result);
    translatedNow++;
    console.log(`PASS LEGAL-R1-N3 full-text translation ${record.id} segments=${result.translatedSegmentCount}`);
  } catch (error) {
    failures.push({ recordId: record.id, error: String(error?.message || error) });
    console.error(`FAIL LEGAL-R1-N3 ${record.id}: ${error?.message || error}`);
  }
}

const validFiles = [];
for (const record of eligible) {
  const x = readExisting(record);
  if (x) validFiles.push(x);
}
const translatedIds = new Set(validFiles.map(x => x.recordId));
const duplicateBindingCount = validFiles.length - translatedIds.size;
const totalSourceSegments = validFiles.reduce((n, x) => n + Number(x.sourceSegmentCount || 0), 0);
const totalTranslatedSegments = validFiles.reduce((n, x) => n + Number(x.translatedSegmentCount || 0), 0);
const coveragePct = eligible.length ? Number(((validFiles.length / eligible.length) * 100).toFixed(4)) : 100;

const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  node: 'LEGAL-R1-N3',
  datasetVersion: db.datasetVersion,
  eligibleRecordCount: eligible.length,
  translatedRecordCount: validFiles.length,
  coveragePct,
  totalSourceSegments,
  totalTranslatedSegments,
  segmentCoveragePct: totalSourceSegments ? Number(((totalTranslatedSegments / totalSourceSegments) * 100).toFixed(4)) : 0,
  duplicateBindingCount,
  translatedNow,
  attemptedNow: selected.length,
  failures,
  complete: validFiles.length === eligible.length && duplicateBindingCount === 0 && totalSourceSegments === totalTranslatedSegments && failures.length === 0
};
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify(index, null, 2));

if (index.complete) console.log('LEGAL-R1-N3: 100% FULL-TEXT TRANSLATION PASS');
else console.log(`LEGAL-R1-N3: IN PROGRESS ${index.translatedRecordCount}/${index.eligibleRecordCount}; failures=${failures.length}`);
