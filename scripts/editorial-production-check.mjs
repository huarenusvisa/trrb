// Reuse the production release gate; never report success from a homepage alone.
import assert from 'node:assert/strict';
const origin = (process.env.SITE_URL || 'https://trrb.net').replace(/\/$/,'');
const checks = [
  ['/xijinping','习近平专题'],
  ['/xijinping?page=2','习近平专题'],
  ['/china-politics','中国政治'],
  ['/china-politics?view=appointments','中国政治'],
  ['/iceandpolice','ICE执法与警情'],
  ['/iceandpolice?view=ice','ICE执法与警情'],
  ['/iceandpolice?view=crime','ICE执法与警情']
];
for (const [path,title] of checks) {
  const result = await fetch(origin+path, {headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  assert.equal(result.status,200,`${path}: HTTP ${result.status}`);
  const html = await result.text();
  assert.ok(html.includes(`<h1>${title}</h1>`),`${path}: missing title`);
  assert.match(html, /<article class="trump-item/ ,`${path}: no article content`);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /rel="canonical"/);
  assert.doesNotMatch(result.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(html, /href="\/(?:hot-headlines|us-politics|us-crime|ice|trump|news|china-officialdom|important-news)\//);
  console.log(`Accepted ${path}`);
}

// Migrated articles must resolve to their own indexable body, not a 410 or homepage.
for (const [path, legacyId] of [
  ['/小庭刚走完-大庭就压上来-加州移民案突然进入生死/', 'wp112110'],
  ['/105167-2/', 'wp105167']
]) {
  const first = await fetch(origin + path, {
    redirect: 'manual', signal: AbortSignal.timeout(20000)
  });
  assert.equal(first.status, 301, path + ': missing permanent recovery redirect');
  const location = first.headers.get('location');
  assert.ok(location, path + ': missing Location');
  const target = new URL(location, origin);
  assert.equal(target.origin, new URL(origin).origin, path + ': unexpected external redirect');
  assert.ok(target.pathname.endsWith(legacyId), path + ': wrong article destination');
  const result = await fetch(target, { signal: AbortSignal.timeout(20000) });
  assert.equal(result.status, 200, path + ': recovered article unavailable');
  const html = await result.text();
  assert.match(html, /class=["'][^"']*article-body/, path + ': missing article body');
  assert.doesNotMatch(result.headers.get('x-robots-tag') || '', /noindex/i);
  assert.doesNotMatch(html, /<meta[^>]*name=["']robots["'][^>]*noindex/i);
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
  assert.ok(canonical, path + ': missing canonical');
  assert.equal(new URL(canonical, origin).href, result.url, path + ': canonical mismatch');
  console.log('Accepted legacy recovery ' + path);
}

// These missing originals were confirmed retired; they must not become soft 404s.
for (const path of ['/荷兰调查deepseek数据收集/', '/?p=2465']) {
  const result = await fetch(origin + path, { signal: AbortSignal.timeout(20000) });
  assert.ok([404, 410].includes(result.status), path + ': retired URL must stay unavailable, not homepage 200 or server error');
  assert.match(result.headers.get('x-robots-tag') || '', /noindex/i);
  console.log('Accepted retired legacy URL ' + path);
}
