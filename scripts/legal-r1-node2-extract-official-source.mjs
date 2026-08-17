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
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function segmentsFromPdfText(text) {
  const pages = text.split('\f');
  const segments = [];
  let order = 0;
  pages.forEach((page, pageIndex) => {
    const cleaned = normalizeText(page);
    if (!cleaned) return;
    const paragraphs = cleaned.split(/\n\s*\n/).map(normalizeText).filter(Boolean);
    for (const paragraph of paragraphs) segments.push({ segmentId: `p${pageIndex + 1}-s${++order}`, order, page: pageIndex + 1, type: 'paragraph', text: paragraph });
  });
  return segments;
}
async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'TRRB-Legal-R1/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return { contentType: res.headers.get('content-type') || '', bytes: buf.length, finalUrl: res.url };
}

const summary = [];
for (const r of selected) {
  const sourceUrl = r.officialPdfUrl || r.officialUrl;
  const tempPdf = path.join(os.tmpdir(), `legal-r1-${r.id}.pdf`);
  const outPath = path.join(outputDir, `${r.id}.json`);
  const base = { schemaVersion: 1, recordId: r.id, sourceSystem: r.sourceSystem, datasetVersion: dataset.datasetVersion, officialUrl: r.officialUrl || null, officialPdfUrl: r.officialPdfUrl || null, sourceUrl, extractedAt: new Date().toISOString(), extractionMethod: 'pdftotext-text-layer', sourceFormat: r.officialPdfUrl ? 'pdf' : 'unknown' };
  try {
    if (!r.officialPdfUrl) throw new Error('HTML extraction not yet implemented; metadata/summary substitution is forbidden');
    const meta = await download(sourceUrl, tempPdf);
    const raw = execFileSync('pdftotext', ['-layout', tempPdf, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const segments = segmentsFromPdfText(raw);
    if (segments.length === 0) {
      fs.writeFileSync(outPath, JSON.stringify({ ...base, status: 'NEEDS_OCR', ...meta, segments: [], error: 'PDF text layer yielded no usable body text' }, null, 2) + '\n');
      summary.push({ recordId: r.id, status: 'NEEDS_OCR' });
      continue;
    }
    fs.writeFileSync(outPath, JSON.stringify({ ...base, status: 'EXTRACTED', ...meta, segmentCount: segments.length, segments }, null, 2) + '\n');
    summary.push({ recordId: r.id, status: 'EXTRACTED', segmentCount: segments.length });
  } catch (error) {
    fs.writeFileSync(outPath, JSON.stringify({ ...base, status: 'FAILED', segments: [], error: String(error?.message || error) }, null, 2) + '\n');
    summary.push({ recordId: r.id, status: 'FAILED', error: String(error?.message || error) });
  } finally { try { fs.unlinkSync(tempPdf); } catch {} }
}
console.log(JSON.stringify({ audit: 'LEGAL-R1-N2-EXTRACT', datasetVersion: dataset.datasetVersion, selected: selected.length, extracted: summary.filter(x => x.status === 'EXTRACTED').length, needsOcr: summary.filter(x => x.status === 'NEEDS_OCR').length, failed: summary.filter(x => x.status === 'FAILED').length, results: summary }, null, 2));
