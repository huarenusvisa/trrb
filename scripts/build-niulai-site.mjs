import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, '.netlify', 'niulai-bundle');
const output = join(bundle, 'public');

await rm(bundle, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(join(output, 'assets', 'topic-focus'), { recursive: true });

// The repository's niulai directory is the only UI source. The independent
// domain receives a generated deployment bundle, not a second maintained copy.
await cp(join(root, 'niulai'), output, { recursive: true });
await cp(join(root, 'assets', 'topic-focus', 'finance-market.svg'), join(output, 'favicon.svg'));
await cp(join(root, 'assets', 'topic-focus', 'finance-market.svg'), join(output, 'assets', 'topic-focus', 'finance-market.svg'));

await writeFile(join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://niulai.us/sitemap.xml\n`);
await writeFile(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://niulai.us/</loc></url>
  <url><loc>https://niulai.us/stock.html</loc></url>
  <url><loc>https://niulai.us/fund.html</loc></url>
</urlset>\n`);

// One data source: every finance request is internally proxied to the canonical
// 唐人日报 gateway. The Niulai site stores no provider key and runs no duplicate
// finance/news function or database.
await writeFile(join(output, '_redirects'), `
http://niulai.us/* https://niulai.us/:splat 301!
http://www.niulai.us/* https://niulai.us/:splat 301!
https://www.niulai.us/* https://niulai.us/:splat 301!
/api/finance/* https://trrb.net/api/finance/:splat 200
`.trimStart());

await writeFile(join(output, '_headers'), `
/*
  X-Robots-Tag: index, follow

/*.html
  Cache-Control: no-cache, no-store, must-revalidate
  Content-Security-Policy: upgrade-insecure-requests; block-all-mixed-content
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/*.js
  Cache-Control: no-cache, no-store, must-revalidate

/*.css
  Cache-Control: no-cache, no-store, must-revalidate

/favicon.svg
  Cache-Control: public, max-age=86400

/favicon.ico
  Content-Type: image/x-icon
  Cache-Control: public, max-age=86400

/*.png
  Content-Type: image/png
  Cache-Control: public, max-age=31536000, immutable

/site.webmanifest
  Content-Type: application/manifest+json; charset=UTF-8
`.trimStart());

await writeFile(join(bundle, 'netlify.toml'), `
[build]
  publish = "public"
`.trimStart());

console.log(`Niulai single-source site built at ${output}`);
