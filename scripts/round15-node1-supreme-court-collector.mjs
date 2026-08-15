import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCE = 'https://www.supremecourt.gov';
const now = new Date();
const termYear = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const termCode = String(termYear).slice(-2);
const sourceUrl = `${SOURCE}/opinions/slipopinion/${termCode}`;
const writeData = process.argv.includes('--write-data');
const checks = [];
let failures = 0;

function check(ok, label, detail = '') {
  const row = { ok: Boolean(ok), label, detail };
  checks.push(row);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

function cleanText(value = '') {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(href = '') {
  if (!href) return '';
  try { return new URL(href, SOURCE).href; } catch { return ''; }
}

function isoDate(raw = '') {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return '';
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return `${String(year).padStart(4, '0')}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

async function get(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'TRRB-Legal-Database/1.0 (+https://trrb.net)',
        accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8',
        ...options.headers
      },
      ...options
    });
  } finally {
    clearTimeout(timer);
  }
}

const response = await get(sourceUrl);
const html = await response.text();
check(response.status === 200, '美国最高法院 Slip Opinions 官方页面可访问', `status=${response.status}; term=${termYear}`);
check(/Opinions of the Court/i.test(html), '官方页面识别为 Opinions of the Court');

const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
const records = [];

for (const row of rows) {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  if (cells.length < 4) continue;

  const dateRaw = cleanText(cells[1]);
  const docket = cleanText(cells[2]);
  const nameCell = cells[3];
  const name = cleanText(nameCell).replace(/\s+Revisions?:.*$/i, '').trim();
  const href = nameCell.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  const pdfUrl = absoluteUrl(href);
  const releaseNo = cleanText(cells[0]);
  const justice = cells[4] ? cleanText(cells[4]) : '';
  const citation = cells[5] ? cleanText(cells[5]) : '';
  const publicationDate = isoDate(dateRaw);

  if (!docket || !name || !publicationDate || !pdfUrl) continue;
  if (!/^https:\/\/www\.supremecourt\.gov\//i.test(pdfUrl)) continue;

  const revisionLinks = [...row.matchAll(/href\s*=\s*["']([^"']+)["'][^>]*>([^<]*\d{1,2}\/\d{1,2}\/\d{2,4}[^<]*)<\/a>/gi)]
    .map((m) => ({ date: isoDate(cleanText(m[2])), url: absoluteUrl(m[1]) }))
    .filter((x) => x.date && x.url && x.url !== pdfUrl);

  records.push({
    source: 'SCOTUS',
    sourceType: 'slip_opinion',
    issuingBody: 'Supreme Court of the United States',
    termYear,
    releaseNo,
    publicationDate,
    docket,
    caseName: name,
    justice,
    officialCitation: citation,
    officialUrl: pdfUrl,
    officialPdfUrl: pdfUrl,
    precedentialStatus: 'opinion_of_the_court',
    jurisdiction: 'United States',
    revisions: revisionLinks
  });
}

records.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate) || a.docket.localeCompare(b.docket));

const uniqueKeys = new Set(records.map((r) => `${r.docket}|${r.publicationDate}|${r.caseName}`));
check(records.length >= 20, '成功解析本届最高法院判决列表', `records=${records.length}`);
check(uniqueKeys.size === records.length, '最高法院记录无重复', `unique=${uniqueKeys.size}/${records.length}`);
check(records.every((r) => r.docket && r.caseName && r.publicationDate && r.officialPdfUrl), '核心字段完整');
check(records.every((r) => /^https:\/\/www\.supremecourt\.gov\//i.test(r.officialPdfUrl)), '所有原文链接均来自最高法院官方域名');

const latest = records.slice(0, 3);
let pdfBad = 0;
for (const record of latest) {
  try {
    const pdf = await get(record.officialPdfUrl, { headers: { range: 'bytes=0-1023' } });
    const type = pdf.headers.get('content-type') || '';
    if (!(pdf.status === 200 || pdf.status === 206) || !/pdf|octet-stream/i.test(type)) {
      pdfBad += 1;
      console.log(`FAIL PDF ${record.docket} status=${pdf.status} type=${type}`);
    }
    try { await pdf.body?.cancel(); } catch {}
  } catch (error) {
    pdfBad += 1;
    console.log(`FAIL PDF ${record.docket} ${error?.message || error}`);
  }
}
check(latest.length === 3 && pdfBad === 0, '最新3份官方判决PDF可验证', `checked=${latest.length}; bad=${pdfBad}`);

const dataset = {
  schemaVersion: 1,
  source: 'Supreme Court of the United States',
  sourceUrl,
  termYear,
  recordCount: records.length,
  records
};

if (writeData && failures === 0) {
  mkdirSync('data/legal', { recursive: true });
  writeFileSync('data/legal/supreme-court-latest.json', `${JSON.stringify(dataset, null, 2)}\n`);
  console.log('DATA data/legal/supreme-court-latest.json updated deterministically');
}

writeFileSync('round15-node1-supreme-court-audit.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceUrl,
  termYear,
  recordCount: records.length,
  latest: records.slice(0, 5),
  checks,
  failures
}, null, 2));

console.log(`ROUND15 NODE1 audit: checks=${checks.length}; failures=${failures}; records=${records.length}`);
if (failures === 0) {
  console.log('ROUND15 NODE1 PASS: Supreme Court official opinion automatic collection verified');
} else {
  console.log('ROUND15 NODE1 FAIL: Supreme Court automatic collection not ready');
  process.exitCode = 1;
}
