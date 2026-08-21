import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '_redirects');
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';

const required = [
  'http://trrb.net/* https://trrb.net/:splat 301!',
  'http://www.trrb.net/* https://trrb.net/:splat 301!',
  'https://www.trrb.net/* https://trrb.net/:splat 301!',
  '/index.html / 301!',
  '/important /important-news 301!',
  '/hot /hot-headlines 301!',
  '/politics /us-politics 301!',
  '/crime /us-crime 301!',
  '/china /china-officialdom 301!',
  '/uscis /immigration 301!',
  '/dhs /immigration 301!',
  '/cbp /immigration 301!',
  '/visa /immigration 301!',
  '/world /important-news 301!',
  '/immigration-us /immigration 301!',
  '/asylum-guide /immigrate/center?path=humanitarian 301!',
  '/asylum /immigrate/center?path=humanitarian 301!',
  '/asylum/ /immigrate/center?path=humanitarian 301!',
  '/asylum/:slug /immigration/:slug 301!',
  '/important-news /listing.html?category=%E9%87%8D%E8%A6%81%E6%96%B0%E9%97%BB 200!',
  '/hot-headlines /listing.html?category=%E7%83%AD%E9%97%A8%E5%A4%B4%E6%9D%A1 200!',
  '/immigration /listing.html?category=%E7%A7%BB%E6%B0%91%E7%BE%8E%E5%9B%BD 200!',
  '/ice /topic/ice/live-v6.html 200!',
  '/ice/ /ice 301!',
  '/ice/news /listing.html?category=ICE%E6%89%A7%E6%B3%95%E5%8A%A8%E6%80%81 200!',
  '/ice/news/ /ice/news 301!',
  '/topic/ice /ice 301!',
  '/topic/ice/ /ice 301!',
  '/trump /trump/index.html 200!',
  '/topic/trump /trump 301!',
  '/topic/trump/ /trump 301!'
];

const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
const requiredPaths = new Set(required.map((rule) => rule.split(/\s+/)[0]));
const retiredAsylumPaths = new Set(['/asylum', '/asylum/', '/asylum/:slug', '/asylum-guide']);
// Netlify normalizes trailing slashes before redirect matching. Keeping the
// former `/trump/ -> /trump` rule therefore made `/trump` redirect to itself.
const retiredNormalizedRedirectPaths = new Set(['/trump/']);
const filtered = lines.filter((line) => {
  const route = line.split(/\s+/)[0];
  return !requiredPaths.has(route) && !retiredAsylumPaths.has(route) && !retiredNormalizedRedirectPaths.has(route);
});
const output = [...required, ...filtered].join('\n') + '\n';
fs.writeFileSync(file, output);

// This script is the final authority for generated redirect metadata. Fail in
// the same process if another generated line managed to retain a conflicting
// rule for one of the canonical paths.
const outputLines = output.trim().split(/\r?\n/).filter(Boolean);
for (const rule of required) {
  if (!outputLines.includes(rule)) throw new Error(`required canonical redirect missing after finalize: ${rule}`);
  const route = rule.split(/\s+/)[0];
  const samePath = outputLines.filter((line) => line.split(/\s+/)[0] === route);
  if (samePath.length !== 1) throw new Error(`conflicting redirect rules remain for ${route}: ${samePath.join(' || ')}`);
}
for (const [route, target] of [
  ['/asylum-guide', '/immigrate/center?path=humanitarian'],
  ['/asylum', '/immigrate/center?path=humanitarian'],
  ['/asylum/', '/immigrate/center?path=humanitarian'],
  ['/asylum/:slug', '/immigration/:slug'],
  ['/ice/', '/ice'],
  ['/ice/news/', '/ice/news'],
  ['/topic/ice', '/ice'],
  ['/topic/ice/', '/ice'],
  ['/topic/trump', '/trump'],
  ['/topic/trump/', '/trump']
]) {
  const expected = `${route} ${target} 301!`;
  if (!outputLines.includes(expected)) throw new Error(`duplicate public topic URL is not permanently canonicalized: ${expected}`);
}
if (outputLines.some((line) => /^\/asylum(?:\s|\/)/.test(line) && /listing\.html\?category=.*(?:%E5%BA%87%E6%8A%A4%E7%99%BE%E7%A7%91|庇护百科)/i.test(line))) {
  throw new Error('retired asylum encyclopedia internal rewrite survived redirect finalization');
}
if (outputLines.some((line) => line.split(/\s+/)[0] === '/trump/')) {
  throw new Error('Netlify-normalized /trump/ self-redirect survived redirect finalization');
}

console.log(`[redirects] finalized and verified ${required.length} canonical/special rules + ${filtered.length} generated rules`);

// Netlify's normal build still runs the homepage optimizer through this script,
// but scheduled metadata-only syncs can pass --redirects-only so they never
// leave an unstaged index.html change that blocks git pull --rebase/push.
if (!process.argv.includes('--redirects-only')) {
  await import('./optimize-homepage-performance.mjs');
}
