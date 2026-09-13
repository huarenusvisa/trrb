import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAsylumJudgeSeo } from './build-asylumjudge-seo.mjs';
import { applyAsylumJudgeIndexingHygiene } from './asylumjudge-indexing-hygiene.mjs';
import { applyAsylumJudgeSearchIntent } from './asylumjudge-search-intent-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, '.netlify', 'asylumjudge-bundle');
const output = join(bundle, 'public');
const functions = join(bundle, 'netlify', 'functions');
const edgeFunctions = join(bundle, 'netlify', 'edge-functions');

await rm(bundle, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(join(functions, '_shared'), { recursive: true });
await mkdir(edgeFunctions, { recursive: true });

await cp(join(root, 'asylumjudge'), join(output, 'asylumjudge'), { recursive: true });
await cp(join(root, 'asylumjudge', 'index.html'), join(output, 'index.html'));
await cp(join(root, 'asylumjudge', 'robots.txt'), join(output, 'robots.txt'));
await cp(join(root, 'asylumjudge', 'sitemap.xml'), join(output, 'sitemap.xml'));
await cp(join(root, 'asylumjudge', 'favicon.ico'), join(output, 'favicon.ico'));
await cp(join(root, 'asylumjudge', 'logo-mark.svg'), join(output, 'favicon.svg'));
await cp(join(root, 'asylumjudge', 'favicon-48.png'), join(output, 'favicon-48.png'));
await cp(join(root, 'asylumjudge', 'apple-touch-icon.png'), join(output, 'apple-touch-icon.png'));
await cp(join(root, 'asylumjudge', 'site.webmanifest'), join(output, 'site.webmanifest'));
await cp(join(root, 'asylumjudge', 'google0894cf097fd7415e.html'), join(output, 'google0894cf097fd7415e.html'));
await cp(join(root, 'asylumjudge', '8d42a4dac6059bb279cede8301423e6d.txt'), join(output, '8d42a4dac6059bb279cede8301423e6d.txt'));
await cp(join(root, 'immigration-judge-approval-rate'), join(output, 'immigration-judge-approval-rate'), { recursive: true });
await cp(join(root, 'styles.css'), join(output, 'styles.css'));
await cp(join(root, 'trrb-logo-cropped.webp'), join(output, 'trrb-logo-cropped.webp'));
await cp(join(root, 'asylumjudge', 'immigration-judges-proxy.js'), join(functions, 'immigration-judges.js'));
await cp(join(root, 'asylumjudge-community.html'), join(output, 'asylumjudge-community.html'));
await cp(join(root, 'community'), join(output, 'community'), { recursive: true });
await mkdir(join(output, 'assets'), { recursive: true });
await cp(join(root, 'assets', 'supabase-client.js'), join(output, 'assets', 'supabase-client.js'));

await buildAsylumJudgeSeo({ root, output });
await applyAsylumJudgeIndexingHygiene({ root, output });
await applyAsylumJudgeSearchIntent({ root, output });
// One consolidated post-build SEO pass: concentrate crawl budget on the four
// strongest search locales, lengthen thin meta descriptions, strengthen the
// hierarchy of indexable detail pages, remove low-priority translated details
// from sitemaps, and add citeable Dataset metadata.
await import('./asylumjudge-search-quality.mjs');

const localePrefixes = ['en', 'es', 'fr', 'pt-br', 'hi', 'zh-hant', 'ru', 'ar', 'tr'];
const localizedRewrites = localePrefixes.flatMap((locale) => [
  `/${locale} /${locale}/ 301!`,
  `/${locale}/courts /${locale}/courts/ 301!`,
  `/${locale}/states /${locale}/states/ 301!`,
  `/${locale}/nationality /${locale}/nationality/ 301!`,
  `/${locale}/compare /${locale}/compare/ 301!`,
  `/${locale}/methodology /methodology/ 301!`,
  `/${locale}/methodology/ /methodology/ 301!`,
  `/${locale}/judge-backgrounds /${locale}/judge-backgrounds/ 301!`,
  `/${locale}/judge /immigration-judge-approval-rate/detail.html 200`,
  `/${locale}/court /immigration-judge-approval-rate/court-detail.html 200`
]).join('\n');

await writeFile(join(output, '_redirects'), `
http://immigrationjudge.net/ https://asylumjudge.com/en/ 301!
http://immigrationjudge.net/* https://asylumjudge.com/en/:splat 301!
http://www.immigrationjudge.net/ https://asylumjudge.com/en/ 301!
http://www.immigrationjudge.net/* https://asylumjudge.com/en/:splat 301!
https://immigrationjudge.net/ https://asylumjudge.com/en/ 301!
https://immigrationjudge.net/* https://asylumjudge.com/en/:splat 301!
https://www.immigrationjudge.net/ https://asylumjudge.com/en/ 301!
https://www.immigrationjudge.net/* https://asylumjudge.com/en/:splat 301!
http://immigrationjudge.us/ https://asylumjudge.com/ 301!
http://immigrationjudge.us/* https://asylumjudge.com/:splat 301!
http://www.immigrationjudge.us/ https://asylumjudge.com/ 301!
http://www.immigrationjudge.us/* https://asylumjudge.com/:splat 301!
https://immigrationjudge.us/ https://asylumjudge.com/ 301!
https://immigrationjudge.us/* https://asylumjudge.com/:splat 301!
https://www.immigrationjudge.us/ https://asylumjudge.com/ 301!
https://www.immigrationjudge.us/* https://asylumjudge.com/:splat 301!
/asylumjudge/index.html / 301!
/asylumjudge/trrb.html / 301!
/asylumjudge/judge-backgrounds.html /judge-backgrounds/ 301!
/asylumjudge-community.html /community/ 301!
/hot-headlines https://trrb.net/hot-headlines 301!
/us-politics https://trrb.net/us-politics 301!
/us-crime https://trrb.net/us-crime 301!
/ice https://trrb.net/ice 301!
/immigrate/center https://trrb.net/immigrate/center 301!
/immigrate/ https://trrb.net/immigrate/ 301!
/huarengongzuo/ https://trrb.net/huarengongzuo/ 301!
/jobs/ https://trrb.net/jobs/ 301!
/legal/ https://trrb.net/legal/ 301!
/privacy.html https://trrb.net/privacy.html 301!
/terms.html https://trrb.net/terms.html 301!
/immigration-judge-approval-rate/index.html / 301!
/immigration-judge-approval-rate/detail.html /judge 301!
/immigration-judge-approval-rate/court-detail.html /court 301!
/immigration-judge-approval-rate/courts.html /courts/ 301!
/immigration-judge-approval-rate/states.html /states/ 301!
/immigration-judge-approval-rate/china-dashboard.html /nationality/ 301!
/immigration-judge-approval-rate/compare.html /compare/ 301!
/immigration-judge-approval-rate/methodology.html /methodology/ 301!
/judge /immigration-judge-approval-rate/detail.html 200
/court /immigration-judge-approval-rate/court-detail.html 200
/courts /courts/ 301!
/states /states/ 301!
/nationality /nationality/ 301!
/compare /compare/ 301!
/judge-backgrounds /judge-backgrounds/ 301!
/china /nationalities/china--ch/ 301!
/methodology /methodology/ 301!
/community /asylumjudge-community.html 200!
/community/ /asylumjudge-community.html 200!
/immigration-judge-approval-rate / 301!
/immigration-judge-approval-rate/ / 301!
/asylum-judge-rating /en/asylum-judge-rating/ 301!
/asylum-judge-rating/ /en/asylum-judge-rating/ 301!
/asylum-judge-approval-rate /asylum-judge-approval-rate/ 301!
${localizedRewrites}
`.trimStart());

await writeFile(join(output, '_headers'), `
/*.html
  Cache-Control: no-cache, no-store, must-revalidate
  Content-Security-Policy: upgrade-insecure-requests; block-all-mixed-content
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/*.js
  Cache-Control: public, max-age=0, must-revalidate

/*.css
  Cache-Control: public, max-age=0, must-revalidate

/robots.txt
  Content-Type: text/plain; charset=UTF-8

/sitemap.xml
  Content-Type: application/xml; charset=UTF-8
  Cache-Control: public, max-age=3600

/sitemap-*.xml
  Content-Type: application/xml; charset=UTF-8
  Cache-Control: public, max-age=3600

/judge
  X-Robots-Tag: noindex, follow

/court
  X-Robots-Tag: noindex, follow

/*/judge
  X-Robots-Tag: noindex, follow

/*/court
  X-Robots-Tag: noindex, follow
`.trimStart());

await writeFile(join(bundle, 'netlify.toml'), `
[build]
  publish = "public"

[functions]
  directory = "netlify/functions"
`.trimStart());

console.log(`AsylumJudge site built at ${output}`);
console.log(`AsylumJudge functions built at ${functions}`);
