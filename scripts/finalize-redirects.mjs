import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '_redirects');
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';

const required = [
  'http://huarengongzuo.com/* https://huarengongzuo.com/:splat 301!',
  'http://www.huarengongzuo.com/* https://huarengongzuo.com/:splat 301!',
  'https://www.huarengongzuo.com/* https://huarengongzuo.com/:splat 301!',
  'https://huarengongzuo.com/favicon.ico /huarengongzuo/logo-mark.svg 200!',
  'https://huarengongzuo.com/favicon.svg /huarengongzuo/logo-mark.svg 200!',
  'https://huarengongzuo.com/site.webmanifest /huarengongzuo/site.webmanifest 200!',
  'https://huarengongzuo.com/ q=:q place=:place /huarengongzuo/index.html 200!',
  'https://huarengongzuo.com/ q=:q /huarengongzuo/index.html 200!',
  'https://huarengongzuo.com/ place=:place /huarengongzuo/index.html 200!',
  'https://huarengongzuo.com/ sort=:sort /huarengongzuo/index.html 200!',
  'https://huarengongzuo.com/ /huarengongzuo/index.html 200!',
  'https://huarengongzuo.com/robots.txt /huarengongzuo/robots.txt 200!',
  'https://huarengongzuo.com/sitemap.xml /huarengongzuo/sitemap.xml 200!',
  'http://asylumjudge.com/* https://asylumjudge.com/:splat 301!',
  'http://www.asylumjudge.com/* https://asylumjudge.com/:splat 301!',
  'https://www.asylumjudge.com/* https://asylumjudge.com/:splat 301!',
  'https://asylumjudge.com/ /asylumjudge/index.html 200!',
  'https://asylumjudge.com/robots.txt /asylumjudge/robots.txt 200!',
  'https://asylumjudge.com/sitemap.xml /asylumjudge/sitemap.xml 200!',
  'https://asylumjudge.com/judge /immigration-judge-approval-rate/detail.html 200!',
  'https://asylumjudge.com/court /immigration-judge-approval-rate/court-detail.html 200!',
  'https://asylumjudge.com/courts /immigration-judge-approval-rate/courts.html 200!',
  'https://asylumjudge.com/states /immigration-judge-approval-rate/states.html 200!',
  'https://asylumjudge.com/nationality /immigration-judge-approval-rate/china-dashboard.html 200!',
  'https://asylumjudge.com/china /nationality?country=China 301!',
  'https://asylumjudge.com/methodology /immigration-judge-approval-rate/methodology.html 200!',
  '/asylumjudge https://asylumjudge.com/ 301!',
  '/asylumjudge/ https://asylumjudge.com/ 301!',
  '/asylumjudge/judge https://asylumjudge.com/judge 301!',
  '/asylumjudge/court https://asylumjudge.com/court 301!',
  '/asylumjudge/courts https://asylumjudge.com/courts 301!',
  '/asylumjudge/states https://asylumjudge.com/states 301!',
  '/asylumjudge/nationality https://asylumjudge.com/nationality 301!',
  '/asylumjudge/china https://asylumjudge.com/nationality?country=China 301!',
  '/asylumjudge/methodology https://asylumjudge.com/methodology 301!',
  '/asylumjudge/* https://asylumjudge.com/:splat 301!',
  '/immigration-judge-approval-rate https://asylumjudge.com/ 301!',
  '/immigration-judge-approval-rate/ https://asylumjudge.com/ 301!',
  '/immigration-judge-approval-rate/index.html https://asylumjudge.com/ 301!',
  '/immigration-judge-approval-rate/detail.html https://asylumjudge.com/judge 301!',
  '/immigration-judge-approval-rate/court-detail.html https://asylumjudge.com/court 301!',
  '/immigration-judge-approval-rate/courts.html https://asylumjudge.com/courts 301!',
  '/immigration-judge-approval-rate/states.html https://asylumjudge.com/states 301!',
  '/immigration-judge-approval-rate/china-dashboard.html https://asylumjudge.com/nationality 301!',
  '/immigration-judge-approval-rate/methodology.html https://asylumjudge.com/methodology 301!',
  '/immigration-judge-approval-rate/* https://asylumjudge.com/ 301!',
  'http://trrb.net/* https://trrb.net/:splat 301!',
  'http://www.trrb.net/* https://trrb.net/:splat 301!',
  'https://www.trrb.net/* https://trrb.net/:splat 301!',
  'https://trrb.net/huarengongzuo https://huarengongzuo.com/ 301!',
  'https://trrb.net/huarengongzuo/ https://huarengongzuo.com/ 301!',
  'https://trrb.net/huarengongzuo/* https://huarengongzuo.com/:splat 301!',
  'https://trrb.net/jobs https://huarengongzuo.com/ 301!',
  'https://trrb.net/jobs/ https://huarengongzuo.com/ 301!',
  'https://trrb.net/jobs/* https://huarengongzuo.com/jobs/:splat 301!',
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
  '/trump/ /trump 301!',
  '/topic/trump /trump 301!',
  '/topic/trump/ /trump 301!',
  '/finance /niulai/ 301!',
  '/finance/ /niulai/ 301!',
  '/finance/:splat /niulai/:splat 301!'
];

const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
const requiredPaths = new Set(required.map((rule) => rule.split(/\s+/)[0]));
const retiredAsylumPaths = new Set(['/asylum', '/asylum/', '/asylum/:slug', '/asylum-guide', '/niulai', '/niulai/*']);
const filtered = lines.filter((line) => {
  const route = line.split(/\s+/)[0];
  return !requiredPaths.has(route) && !retiredAsylumPaths.has(route);
});
const output = [...required, ...filtered].join('\n') + '\n';
fs.writeFileSync(file, output);

const sitemapFile = path.join(process.cwd(), 'sitemap.xml');
if (fs.existsSync(sitemapFile)) {
  const sitemap = fs.readFileSync(sitemapFile, 'utf8');
  fs.writeFileSync(
    sitemapFile,
    sitemap.replace(
      /\s*<url>\s*<loc>https:\/\/trrb\.net\/(?:immigration-judge-approval-rate|asylumjudge)<\/loc>[\s\S]*?<\/url>/g,
      ''
    )
  );
}

// This script is the final authority for generated redirect metadata. Fail in
// the same process if another generated line managed to retain a conflicting
// rule for one of the canonical paths.
const outputLines = output.trim().split(/\r?\n/).filter(Boolean);
for (const rule of required) {
  if (!outputLines.includes(rule)) throw new Error(`required canonical redirect missing after finalize: ${rule}`);
  const route = rule.split(/\s+/)[0];
  const samePath = outputLines.filter((line) => line.split(/\s+/)[0] === route);
  const allowsQueryVariants = route === 'https://huarengongzuo.com/';
  if ((!allowsQueryVariants && samePath.length !== 1) || new Set(samePath).size !== samePath.length) {
    throw new Error(`conflicting redirect rules remain for ${route}: ${samePath.join(' || ')}`);
  }
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
  ['/trump/', '/trump'],
  ['/topic/trump', '/trump'],
  ['/topic/trump/', '/trump'],
  ['/finance', '/niulai/'],
  ['/finance/', '/niulai/'],
  ['/finance/:splat', '/niulai/:splat']
]) {
  const expected = `${route} ${target} 301!`;
  if (!outputLines.includes(expected)) throw new Error(`duplicate public topic URL is not permanently canonicalized: ${expected}`);
}
if (outputLines.some((line) => /^\/asylum(?:\s|\/)/.test(line) && /listing\.html\?category=.*(?:%E5%BA%87%E6%8A%A4%E7%99%BE%E7%A7%91|庇护百科)/i.test(line))) {
  throw new Error('retired asylum encyclopedia internal rewrite survived redirect finalization');
}

console.log(`[redirects] finalized and verified ${required.length} canonical/special rules + ${filtered.length} generated rules`);

// Netlify's normal build still runs the homepage optimizer through this script,
// but scheduled metadata-only syncs can pass --redirects-only so they never
// leave an unstaged index.html change that blocks git pull --rebase/push.
if (!process.argv.includes('--redirects-only')) {
  await import('./optimize-homepage-performance.mjs');
}
