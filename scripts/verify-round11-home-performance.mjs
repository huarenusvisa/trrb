#!/usr/bin/env node
const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const HOME = `${ORIGIN}/`;
const TIMEOUT = Math.max(4000, Number(process.env.CRAWL_TIMEOUT_MS || 15000));

const browserHeaders = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'cache-control': 'no-cache'
};

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers: { ...browserHeaders, ...(init.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
}

function extract(html, tag, attr) {
  const out = [];
  const re = new RegExp(`<${tag}\\b[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'gi');
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

const response = await fetchWithTimeout(HOME);
if (!response.ok) throw new Error(`homepage HTTP ${response.status}`);
const html = await response.text();
const head = (html.match(/<head>[\s\S]*?<\/head>/i) || [''])[0];
const scripts = extract(html, 'script', 'src').map((v) => new URL(v, HOME));
const styles = extract(html, 'link', 'href')
  .filter((v) => /\.css(?:\?|$)/i.test(v))
  .map((v) => new URL(v, HOME));
const chunkScripts = scripts.filter((url) => /\/articles-chunk-\d+\.js$/i.test(url.pathname));
const failures = [];

if (chunkScripts.length) failures.push(`homepage still loads ${chunkScripts.length} redundant article chunk scripts`);
if (!/href=["'](?:\.\/|\/)topic-feed\.css(?:\?[^"']+)?["']/i.test(head)) {
  failures.push('topic-feed.css is not promoted into <head>');
}
if (!/rel=["']preload["'][^>]+trrb-logo-cropped\.webp/i.test(head) && !/trrb-logo-cropped\.webp[^>]+rel=["']preload["']/i.test(head)) {
  failures.push('homepage logo preload missing');
}

let bytes = 0;
for (const url of [...styles, ...scripts]) {
  const asset = await fetchWithTimeout(url.href, { headers: { accept: '*/*' } });
  if (!asset.ok) {
    failures.push(`${url.pathname} HTTP ${asset.status}`);
    continue;
  }
  const type = asset.headers.get('content-type') || '';
  if (/\.css$/i.test(url.pathname) && !/text\/css/i.test(type)) failures.push(`${url.pathname} wrong CSS MIME: ${type}`);
  if (/\.js$/i.test(url.pathname) && !/(?:javascript|ecmascript)/i.test(type)) failures.push(`${url.pathname} wrong JS MIME: ${type}`);
  const length = Number(asset.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > 0) bytes += length;
  await asset.body?.cancel().catch(() => {});
}

if (scripts.length > 18) failures.push(`too many initial homepage scripts: ${scripts.length} (budget 18)`);

if (failures.length) {
  console.error(`Round 11 homepage performance FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Round 11 homepage performance PASS: scripts=${scripts.length}, styles=${styles.length}, redundantChunks=0, declaredAssetBytes=${bytes}`);
