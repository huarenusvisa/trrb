import fs from 'node:fs';
import crypto from 'node:crypto';

const input = process.argv[2] || 'data/legal/unified-legal-authorities-latest.json';
const output = process.argv[3] || null;

function fail(message) {
  console.error(`LEGAL-R1-N1 FAIL: ${message}`);
  process.exitCode = 1;
}

const raw = fs.readFileSync(input, 'utf8');
const db = JSON.parse(raw);
const records = Array.isArray(db.records) ? db.records : [];
const errors = [];
const seen = new Set();
const sourceCounts = {};
let pdfCandidates = 0;
let htmlCandidates = 0;
let recordsWithOfficialSource = 0;

if (!db.datasetVersion || typeof db.datasetVersion !== 'string') {
  errors.push('datasetVersion missing');
}
if (!Number.isInteger(db.count) || db.count !== records.length) {
  errors.push(`declared count mismatch: db.count=${db.count} records.length=${records.length}`);
}

for (const [index, r] of records.entries()) {
  const id = String(r?.id || r?.recordId || '').trim();
  const sourceSystem = String(r?.sourceSystem || '').trim();
  const officialUrl = String(r?.officialUrl || '').trim();
  const officialPdfUrl = String(r?.officialPdfUrl || '').trim();
  const officialHtmlUrl = String(r?.officialHtmlUrl || r?.fullTextUrl || '').trim();

  if (!id) errors.push(`record[${index}] missing id/recordId`);
  if (id && seen.has(id)) errors.push(`duplicate recordId: ${id}`);
  if (id) seen.add(id);
  if (!sourceSystem) errors.push(`record ${id || index} missing sourceSystem`);
  if (!officialUrl && !officialPdfUrl && !officialHtmlUrl) {
    errors.push(`record ${id || index} missing first-party source URL`);
  } else {
    recordsWithOfficialSource += 1;
  }

  sourceCounts[sourceSystem || 'UNKNOWN'] = (sourceCounts[sourceSystem || 'UNKNOWN'] || 0) + 1;
  if (officialPdfUrl) pdfCandidates += 1;
  if (officialHtmlUrl && !officialPdfUrl) htmlCandidates += 1;
}

const fullTextCandidateCount = pdfCandidates + htmlCandidates;
const normalizedInventoryKey = JSON.stringify({
  datasetVersion: db.datasetVersion,
  recordCount: records.length,
  sourceCounts,
  fullTextCandidateCount,
  pdfCandidates,
  htmlCandidates,
});
const inventoryVersion = crypto.createHash('sha256').update(normalizedInventoryKey).digest('hex');

const report = {
  audit: 'LEGAL-R1-N1',
  datasetVersion: db.datasetVersion || null,
  inventoryVersion,
  totalLegalRecords: records.length,
  sourceCounts,
  recordsWithOfficialSource,
  fullTextCandidateCount,
  pdfCandidates,
  htmlCandidates,
  duplicateRecordIds: records.length - seen.size,
  errors,
  pass: errors.length === 0 && records.length > 0 && recordsWithOfficialSource === records.length,
};

console.log(JSON.stringify(report, null, 2));
if (output) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  fail(`${errors.length} inventory error(s)`);
} else {
  console.log(`LEGAL-R1-N1 INVENTORY CODE/DATA: PASS (${records.length} records; ${fullTextCandidateCount} explicit full-text candidates)`);
}
