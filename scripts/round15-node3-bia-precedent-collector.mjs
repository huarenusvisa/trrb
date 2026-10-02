import { writeFileSync } from 'node:fs';

const SOURCES = [
  { volume: 29, url: 'https://www.justice.gov/eoir/volume-29' },
  { volume: 30, url: 'https://www.justice.gov/eoir/volume-30' }
];
const UA = 'TRRB-Legal-Collector/1.1 (+https://trrb.net)';
const checks = [];
let failures = 0;

function check(ok, label, detail = '') {
  checks.push({ ok: Boolean(ok), label, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}
function clean(s = '') {
  return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function abs(base, href) { try { return new URL(href, base).toString(); } catch { return ''; } }
async function get(url, accept = 'text/html,application/xhtml+xml,*/*;q=0.8', timeout = 20000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept }, signal: ac.signal });
    return { ok: response.ok, status: response.status, url: response.url, type: response.headers.get('content-type') || '', text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, url, type: '', text: '', error: String(error?.message || error) };
  } finally { clearTimeout(timer); }
}

const entries = [];
const sourceCounts = {};
for (const source of SOURCES) {
  const page = await get(source.url);
  check(page.ok && page.status === 200, `EOIR Volume ${source.volume} official page reachable`, `status=${page.status}`);
  check(/^https:\/\/(www\.)?justice\.gov\//i.test(page.url), `Volume ${source.volume} remains on official justice.gov`, page.url);

  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const anchor of page.text.matchAll(anchorRe)) {
    const href = abs(page.url, anchor[1]);
    if (!href || !/^https:\/\/(www\.)?justice\.gov\//i.test(href)) continue;
    if (!/\.pdf(?:$|[?#])|media|file|download/i.test(href + ' ' + clean(anchor[2]))) continue;

    const before = clean(page.text.slice(Math.max(0, anchor.index - 1800), anchor.index));
    const citationRe = /(Matter of\s+[^,]{1,180}?),?\s*(29|30)\s+I&N\s+Dec\.?\s*(\d+)\s*\(BIA\s+(\d{4})\)/gi;
    const hit = [...before.matchAll(citationRe)].at(-1);
    if (!hit || Number(hit[2]) !== source.volume) continue;

    const caseName = hit[1].replace(/\s+/g, ' ').trim();
    entries.push({
      court: 'Board of Immigration Appeals',
      authorityType: 'BIA precedent decision',
      precedential: true,
      volume: source.volume,
      reporterPage: Number(hit[3]),
      year: Number(hit[4]),
      caseName,
      citation: `${caseName}, ${source.volume} I&N Dec. ${hit[3]} (BIA ${hit[4]})`,
      officialPdfUrl: href,
      officialSourceUrl: source.url
    });
  }
  sourceCounts[source.volume] = entries.filter((entry) => entry.volume === source.volume).length;
}

const byCitation = new Map();
for (const entry of entries) {
  const key = `${entry.volume}:${entry.reporterPage}`;
  const prior = byCitation.get(key);
  if (!prior || (/\.pdf(?:$|[?#])/i.test(entry.officialPdfUrl) && !/\.pdf(?:$|[?#])/i.test(prior.officialPdfUrl))) byCitation.set(key, entry);
}
const decisions = [...byCitation.values()].sort((a, b) => b.volume - a.volume || b.reporterPage - a.reporterPage);
for (const source of SOURCES) {
  const count = decisions.filter((decision) => decision.volume === source.volume).length;
  check(count >= 10, `BIA Volume ${source.volume} precedent decisions parsed`, `count=${count}`);
}
check(decisions.some((decision) => decision.volume === 30 && decision.reporterPage >= 124), 'latest published Volume 30 reporter page is present');
check(decisions.every((decision) => decision.precedential && decision.authorityType === 'BIA precedent decision'), 'dataset contains BIA precedent decisions only');
check(new Set(decisions.map((decision) => `${decision.volume}:${decision.reporterPage}`)).size === decisions.length, 'volume/reporter-page identities are unique', `unique=${decisions.length}`);
check(decisions.every((decision) => /^Matter of\s+/i.test(decision.caseName)), 'case names use official Matter of titles');
check(decisions.every((decision) => /^https:\/\/(www\.)?justice\.gov\//i.test(decision.officialPdfUrl)), 'all decision documents are first-party DOJ/EOIR links');

let badPdf = 0;
for (const decision of decisions.slice(0, 5)) {
  const probe = await get(decision.officialPdfUrl, 'application/pdf,*/*;q=0.8', 15000);
  if (!probe.ok || probe.status !== 200) badPdf += 1;
}
check(badPdf === 0, 'latest official BIA decision documents reachable', `checked=${Math.min(5, decisions.length)}; bad=${badPdf}`);

const output = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  scope: 'Published/precedential BIA decisions in the current EOIR reporter volumes; unpublished BIA decisions are intentionally excluded.',
  sources: SOURCES.map((source) => source.url),
  sourceCounts: Object.fromEntries(SOURCES.map((source) => [String(source.volume), decisions.filter((decision) => decision.volume === source.volume).length])),
  count: decisions.length,
  decisions
};
writeFileSync('data/legal/bia-precedent-latest.json', JSON.stringify(output, null, 2) + '\n');
writeFileSync('round15-node3-bia-precedent-audit.json', JSON.stringify({ generatedAt: new Date().toISOString(), sources: SOURCES, checks, failures, count: decisions.length }, null, 2) + '\n');
console.log(`ROUND15 NODE3 audit: decisions=${decisions.length}; checks=${checks.length}; failures=${failures}`);
if (failures === 0) console.log('ROUND15 NODE3 PASS: BIA precedent decision collection verified');
else { console.log('ROUND15 NODE3 FAIL: BIA precedent collection gaps remain'); process.exitCode = 1; }
