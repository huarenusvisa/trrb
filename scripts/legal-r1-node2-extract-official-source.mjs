import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const datasetPath = arg('--dataset', 'data/legal/unified-legal-authorities-latest.json');
const outputDir = arg('--output', 'data/legal/fulltext-source');
const limit = Number(arg('--limit', '0')) || 0;
const recordId = arg('--record-id');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const records = Array.isArray(dataset.records) ? dataset.records : [];
const eligible = records.filter(r => r?.officialPdfUrl || r?.officialUrl);
const selected = recordId ? eligible.filter(r => r.id === recordId) : (limit > 0 ? eligible.slice(0, limit) : eligible);
if (recordId && selected.length !== 1) throw new Error(`record not found or not eligible: ${recordId}`);
fs.mkdirSync(outputDir, { recursive: true });

function normalizeText(s) {
  return String(s || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const n = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    }
    return named[entity.toLowerCase()] ?? _;
  });
}

function stripTags(s) {
  return normalizeText(decodeEntities(String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')));
}

function segmentsFromPdfText(text) {
  const pages = text.split('\f');
  const segments = [];
  let order = 0;
  pages.forEach((page, pageIndex) => {
    const cleaned = normalizeText(page);
    if (!cleaned) return;
    const paragraphs = cleaned.split(/\n\s*\n/).map(normalizeText).filter(Boolean);
    for (const paragraph of paragraphs) {
      segments.push({ segmentId: `pdf-p${pageIndex + 1}-s${order + 1}`, order: ++order, page: pageIndex + 1, type: 'paragraph', text: paragraph });
    }
  });
  return segments;
}

function segmentsFromHtml(html) {
  let body = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|template|form|button|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || body;
  const segments = [];
  const block = /<(h[1-6]|p|li|blockquote|pre|caption|dt|dd|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  let order = 0;
  const seen = new Set();
  while ((m = block.exec(main))) {
    const tag = m[1].toLowerCase();
    let text = stripTags(m[2]);
    if (tag === 'tr') {
      text = normalizeText(decodeEntities(m[2].replace(/<t[dh]\b[^>]*>/gi, '').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, ' '))).replace(/\s*\|\s*$/, '');
    }
    if (!text || text.length < 2) continue;
    const key = `${tag}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = /^h[1-6]$/.test(tag) ? 'heading' : tag === 'li' ? 'list-item' : tag === 'tr' ? 'table-row' : 'paragraph';
    segments.push({ segmentId: `html-s${order + 1}`, order: ++order, type, level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : undefined, text });
  }
  return segments.map(({ level, ...s }) => level ? { ...s, level } : s);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function looksLikePdf(meta, url = '') {
  const magic = meta?.buf?.subarray(0, 5)?.toString('ascii') || '';
  return /application\/pdf/i.test(meta?.contentType || '') || magic === '%PDF-' || /\.pdf(?:$|[?#])/i.test(url);
}

function fetchSourceWithCurl(url) {
  const buf = execFileSync('curl', [
    '--fail', '--location', '--silent', '--show-error',
    '--retry', '3', '--retry-all-errors', '--retry-delay', '1',
    '--connect-timeout', '20', '--max-time', '120',
    '--user-agent', 'Mozilla/5.0 (compatible; TRRB-Legal-R1/1.2; +https://trrb.net)',
    '--header', 'Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5',
    url
  ], { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
  return { buf, contentType: '', bytes: buf.length, finalUrl: url, transport: 'curl-fallback' };
}

async function fetchSourceDirect(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; TRRB-Legal-R1/1.2; +https://trrb.net)',
          accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5',
          'cache-control': 'no-cache'
        }
      });
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status} for ${url}`);
        error.httpStatus = res.status;
        throw error;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return { buf, contentType: res.headers.get('content-type') || '', bytes: buf.length, finalUrl: res.url, transport: 'fetch' };
    } catch (error) {
      lastError = error;
      if (error?.httpStatus === 404) break;
      if (attempt < 3) await sleep(500 * attempt);
    }
  }
  if (lastError?.httpStatus === 404) throw lastError;
  try {
    return fetchSourceWithCurl(url);
  } catch (curlError) {
    const fetchMessage = String(lastError?.message || lastError || 'fetch failed');
    const curlMessage = String(curlError?.message || curlError || 'curl failed');
    throw new Error(`${fetchMessage}; curl fallback failed: ${curlMessage}`);
  }
}

function ca8CaseNumberFromOpinionUrl(url) {
  const m = String(url || '').match(/^https:\/\/ecf\.ca8\.uscourts\.gov\/cgi-bin\/(\d{2})(\d{4})[PU](?:\d+)?\.pdf(?:[?#].*)?$/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

function officialPdfCandidatesFromHtml(html, baseUrl) {
  const candidates = [];
  const seen = new Set();
  const add = value => {
    if (!value) return;
    let resolved;
    try { resolved = new URL(decodeEntities(value), baseUrl).href; } catch { return; }
    if (!/\.pdf(?:$|[?#])/i.test(resolved) || seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push(resolved);
  };
  let m;
  const href = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
  while ((m = href.exec(html))) add(m[1]);
  const visible = /\b(\d{6}[PU](?:\d+)?\.pdf)\b/gi;
  while ((m = visible.exec(html))) add(m[1]);
  return candidates;
}

async function recoverCa8Opinion(url) {
  const caseNumber = ca8CaseNumberFromOpinionUrl(url);
  if (!caseNumber) return null;
  const caseIndexUrl = `https://ecf.ca8.uscourts.gov/cgi-bin/opnByCase.pl?caseno=${encodeURIComponent(caseNumber)}&getOpn=1`;
  const indexMeta = await fetchSourceDirect(caseIndexUrl);
  const html = indexMeta.buf.toString('utf8');
  const candidates = officialPdfCandidatesFromHtml(html, caseIndexUrl);
  const caseDigits = caseNumber.replace('-', '');
  candidates.sort((a, b) => {
    const aa = path.basename(new URL(a).pathname).startsWith(caseDigits) ? 0 : 1;
    const bb = path.basename(new URL(b).pathname).startsWith(caseDigits) ? 0 : 1;
    return aa - bb;
  });
  for (const candidate of candidates) {
    try {
      const meta = await fetchSourceDirect(candidate);
      if (!looksLikePdf(meta, candidate)) continue;
      return {
        ...meta,
        recoveryMethod: 'ca8-official-case-index',
        recoveryIndexUrl: caseIndexUrl,
        recoveredFrom: url,
        recoveredSourceUrl: candidate
      };
    } catch {}
  }
  return null;
}

async function fetchSource(url) {
  try {
    return await fetchSourceDirect(url);
  } catch (error) {
    if (error?.httpStatus === 404 && ca8CaseNumberFromOpinionUrl(url)) {
      const recovered = await recoverCa8Opinion(url);
      if (recovered) return recovered;
    }
    throw error;
  }
}

function extractPdfBuffer(meta, tempPdf) {
  fs.writeFileSync(tempPdf, meta.buf);
  const raw = execFileSync('pdftotext', ['-layout', tempPdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const segments = segmentsFromPdfText(raw);
  return { ...meta, segments, extractionMethod: 'pdftotext-text-layer', sourceFormat: 'pdf' };
}

async function extractPdf(url, tempPdf) {
  const meta = await fetchSource(url);
  if (!looksLikePdf(meta, meta.recoveredSourceUrl || url)) throw new Error(`Expected PDF but official source returned ${meta.contentType || 'non-PDF content'} for ${url}`);
  return extractPdfBuffer(meta, tempPdf);
}

async function extractHtml(url, tempPdf) {
  const meta = await fetchSource(url);
  if (looksLikePdf(meta, meta.recoveredSourceUrl || url)) return extractPdfBuffer(meta, tempPdf);
  const html = meta.buf.toString('utf8');
  const segments = segmentsFromHtml(html);
  return { ...meta, segments, extractionMethod: 'semantic-html-blocks', sourceFormat: 'html' };
}

const summary = [];
for (const r of selected) {
  const primarySourceUrl = r.officialPdfUrl || r.officialUrl;
  const tempPdf = path.join(os.tmpdir(), `legal-r1-${r.id}.pdf`);
  const outPath = path.join(outputDir, `${r.id}.json`);
  const base = {
    schemaVersion: 2,
    recordId: r.id,
    sourceSystem: r.sourceSystem,
    datasetVersion: dataset.datasetVersion,
    officialUrl: r.officialUrl || null,
    officialPdfUrl: r.officialPdfUrl || null,
    sourceUrl: primarySourceUrl,
    extractedAt: new Date().toISOString()
  };
  try {
    let result;
    let sourceUrl = primarySourceUrl;
    if (r.officialPdfUrl) {
      try {
        result = await extractPdf(r.officialPdfUrl, tempPdf);
      } catch (pdfError) {
        if (!r.officialUrl || r.officialUrl === r.officialPdfUrl) throw pdfError;
        sourceUrl = r.officialUrl;
        result = await extractHtml(r.officialUrl, tempPdf);
      }
    } else {
      result = await extractHtml(r.officialUrl, tempPdf);
    }
    const { buf, segments, ...meta } = result;
    if (!Array.isArray(segments) || segments.length === 0) {
      const status = result.sourceFormat === 'pdf' ? 'NEEDS_OCR' : 'FAILED';
      const error = result.sourceFormat === 'pdf' ? 'PDF text layer yielded no usable body text' : 'Official HTML yielded no usable semantic body blocks';
      fs.writeFileSync(outPath, JSON.stringify({ ...base, sourceUrl, status, ...meta, segments: [], error }, null, 2) + '\n');
      summary.push({ recordId: r.id, status, error });
      continue;
    }
    fs.writeFileSync(outPath, JSON.stringify({ ...base, sourceUrl, status: 'EXTRACTED', ...meta, segmentCount: segments.length, segments }, null, 2) + '\n');
    summary.push({ recordId: r.id, status: 'EXTRACTED', segmentCount: segments.length, sourceFormat: meta.sourceFormat, recoveryMethod: meta.recoveryMethod || null });
  } catch (error) {
    fs.writeFileSync(outPath, JSON.stringify({ ...base, status: 'FAILED', segments: [], error: String(error?.message || error) }, null, 2) + '\n');
    summary.push({ recordId: r.id, status: 'FAILED', error: String(error?.message || error) });
  } finally {
    try { fs.unlinkSync(tempPdf); } catch {}
  }
}

console.log(JSON.stringify({
  audit: 'LEGAL-R1-N2-EXTRACT',
  datasetVersion: dataset.datasetVersion,
  selected: selected.length,
  extracted: summary.filter(x => x.status === 'EXTRACTED').length,
  needsOcr: summary.filter(x => x.status === 'NEEDS_OCR').length,
  failed: summary.filter(x => x.status === 'FAILED').length,
  recovered: summary.filter(x => x.recoveryMethod).length,
  results: summary
}, null, 2));
