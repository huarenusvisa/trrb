import fs from 'node:fs';

const app = fs.readFileSync('legal/legal-app.js', 'utf8');
const html = fs.readFileSync('legal/index.html', 'utf8');
const db = JSON.parse(fs.readFileSync('data/legal/unified-legal-authorities-latest.json', 'utf8'));
const records = Array.isArray(db.records) ? db.records : [];

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const requireText = (haystack, needle, label) => { if (!haystack.includes(needle)) fail(label); };

if (!records.length) fail('unified legal database must contain records');

for (const id of ['legal-q','legal-source','legal-body','legal-type','legal-from','legal-to','legal-sort','legal-reset']) {
  requireText(html, `id="${id}"`, `missing filter control ${id}`);
}
for (const id of ['legal-prev','legal-next','legal-page']) requireText(html, `id="${id}"`, `missing pagination control ${id}`);

for (const key of ['q','source','body','type','from','to','sort','page']) {
  requireText(app, `params.get('${key}')`, `URL state does not restore ${key}`);
}
for (const key of ['q','source','body','type','from','to']) {
  requireText(app, `p.set('${key}'`, `share URL does not persist ${key}`);
}
requireText(app, `p.set('sort'`, 'share URL does not persist sort');
requireText(app, `p.set('page'`, 'share URL does not persist page');
requireText(app, `history.replaceState`, 'filter state is not reflected into a shareable URL');

requireText(app, `r.sourceSystem===state.source`, 'source filter missing');
requireText(app, `r.issuingBody===state.body`, 'issuing-body filter missing');
requireText(app, `r.authorityType===state.type`, 'authority-type filter missing');
requireText(app, `inDateRange(r)`, 'date range filter missing');
requireText(app, `matches(r,state.q)`, 'query filter missing');
requireText(app, `state.sort==='oldest'`, 'oldest sort missing');
requireText(app, `state.sort==='newest'||!state.q`, 'newest/default stable sort missing');
requireText(app, `relevanceScore(b,state.q)-relevanceScore(a,state.q)`, 'relevance sort missing');

const sources = new Set(records.map(r => r.sourceSystem).filter(Boolean));
for (const source of ['SCOTUS','US_CIRCUIT','BIA','WHITE_HOUSE','FEDERAL_REGISTER']) {
  if (!sources.has(source)) fail(`required legal source missing from unified dataset: ${source}`);
}

const circuitBodies = new Set(records.filter(r => r.sourceSystem === 'US_CIRCUIT').map(r => r.issuingBody).filter(Boolean));
const requiredCircuits = [
  'U.S. Court of Appeals for the First Circuit','U.S. Court of Appeals for the Second Circuit','U.S. Court of Appeals for the Third Circuit',
  'U.S. Court of Appeals for the Fourth Circuit','U.S. Court of Appeals for the Fifth Circuit','U.S. Court of Appeals for the Sixth Circuit',
  'U.S. Court of Appeals for the Seventh Circuit','U.S. Court of Appeals for the Eighth Circuit','U.S. Court of Appeals for the Ninth Circuit',
  'U.S. Court of Appeals for the Tenth Circuit','U.S. Court of Appeals for the Eleventh Circuit','U.S. Court of Appeals for the District of Columbia Circuit',
  'U.S. Court of Appeals for the Federal Circuit'
];
for (const body of requiredCircuits) {
  requireText(html, `data-circuit-body="${body}"`, `13-circuit navigation missing ${body}`);
  if (!circuitBodies.has(body)) fail(`unified dataset currently has no record for ${body}`);
}

// Guardrail: node 2 may only affect the legal search UI and must not alter homepage news ranking/freshness.
if (app.includes('homepage') || app.includes('published-news') || app.includes('news-feed')) {
  fail('legal filtering code unexpectedly references homepage/news-feed logic');
}

if (!process.exitCode) {
  console.log(`ROUND 17 NODE 2 PASS: multidimensional filters + shareable URL verified on ${records.length} legal records; 13 circuit bodies present.`);
}
