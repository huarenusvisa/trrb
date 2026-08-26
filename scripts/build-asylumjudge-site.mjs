import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAsylumJudgeSeo } from './build-asylumjudge-seo.mjs';

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

await buildAsylumJudgeSeo({ root, output });

const localePrefixes = ['en', 'es', 'fr', 'pt-br', 'hi', 'zh-hant', 'ru', 'ar', 'tr'];
const localizedRewrites = localePrefixes.flatMap((locale) => [
  `/${locale}/judge /immigration-judge-approval-rate/detail.html 200`,
  `/${locale}/court /immigration-judge-approval-rate/court-detail.html 200`
]).join('\n');

await writeFile(join(output, '_redirects'), `
http://immigrationjudge.net/* https://asylumjudge.com/:splat 301!
http://www.immigrationjudge.net/* https://asylumjudge.com/:splat 301!
https://immigrationjudge.net/* https://asylumjudge.com/:splat 301!
https://www.immigrationjudge.net/* https://asylumjudge.com/:splat 301!
http://immigrationjudge.us/* https://asylumjudge.com/:splat 301!
http://www.immigrationjudge.us/* https://asylumjudge.com/:splat 301!
https://immigrationjudge.us/* https://asylumjudge.com/:splat 301!
https://www.immigrationjudge.us/* https://asylumjudge.com/:splat 301!
/judge /immigration-judge-approval-rate/detail.html 200
/court /immigration-judge-approval-rate/court-detail.html 200
/courts /immigration-judge-approval-rate/courts.html 200
/states /immigration-judge-approval-rate/states.html 200
/nationality /immigration-judge-approval-rate/china-dashboard.html 200
/judge-backgrounds /judge-backgrounds/index.html 200
/china /nationality?country=China 301
/methodology /immigration-judge-approval-rate/methodology.html 200
/immigration-judge-approval-rate /index.html 301
/immigration-judge-approval-rate/ /index.html 301
${localizedRewrites}
`.trimStart());

await writeFile(join(output, '_headers'), `
/*.html
  Cache-Control: no-cache, no-store, must-revalidate
  Content-Security-Policy: upgrade-insecure-requests; block-all-mixed-content
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/*.js
  Cache-Control: no-cache, no-store, must-revalidate

/*.css
  Cache-Control: no-cache, no-store, must-revalidate

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
