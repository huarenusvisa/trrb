const endpoint = 'https://asylumjudge.com/.netlify/functions/immigration-judges';

async function read(params) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url.pathname} returned ${response.status}`);
  return response.json();
}

const search = await read({ q: 'New York' });
if (!Array.isArray(search.results) || !search.results.length) throw new Error('search returned no verified records');
if (!search.methodology || !('official_release' in search) || !search.data_quality) throw new Error('search omitted provenance or methodology');
if (!search.official_release && !search.latest_import?.source_url) throw new Error('search omitted both official release and import source');

const first = search.results[0];
if (!first.id || !first.judge_name) throw new Error('search result omitted judge identity');
if (first.rate_reliable === false && first.approval_rate !== null) throw new Error('unreliable rate was not suppressed');

const detail = await read({ mode: 'detail', id: first.id });
if (detail.judge?.id !== first.id) throw new Error('detail identity does not match search result');
if (!Array.isArray(detail.yearly) || !Array.isArray(detail.nationality)) throw new Error('detail arrays missing');
if (!detail.data_quality || !detail.methodology) throw new Error('detail omitted data quality contract');

console.log(`PASS public search: ${search.count} matching records`);
console.log(`PASS detail contract: ${detail.judge.judge_name}`);
console.log(`PASS provenance: ${detail.data_quality}`);
