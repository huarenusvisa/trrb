// Reuse the production release gate; never report success from a homepage alone.
import assert from 'node:assert/strict';
const origin = (process.env.SITE_URL || 'https://trrb.net').replace(/\/$/,'');
const checks = [
  ['/topic/xi-jinping','习近平专题'],
  ['/topic/xi-jinping?page=2','习近平专题'],
  ['/china-politics','中国政治'],
  ['/china-politics?view=appointments','中国政治'],
  ['/us-enforcement','美国执法与警情'],
  ['/us-enforcement?view=ice','美国执法与警情'],
  ['/us-enforcement?view=crime','美国执法与警情']
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
