#!/usr/bin/env node
import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');
const before = html;

// Full historical article body chunks are redundant on the homepage. Current
// news is rendered from the unified live bundle and the build-time crawlable
// snapshot remains in the HTML if the live API is unavailable.
let removedChunks = 0;
html = html.replace(/<script\s+src=["']\.\/articles-chunk-\d+\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi, () => {
  removedChunks += 1;
  return '';
});

// Keep the topic stylesheet in <head> when an old shell still discovers it at
// the end of <body>. Accept any cache version instead of depending on Round11.
const topicCssMatch = html.match(/<link\s+rel=["']stylesheet["']\s+href=["']\.\/topic-feed\.css\?v=[^"']+["']\s*\/?>(?:\s*)/i);
if (topicCssMatch && html.indexOf(topicCssMatch[0]) > html.indexOf('</head>')) {
  html = html.replace(topicCssMatch[0], '');
  html = html.replace('</head>', `    ${topicCssMatch[0].trim()}\n  </head>`);
}

// The runtime route normalizer must be present before dynamic homepage modules.
// It is only a fallback; renderers themselves should already emit pretty URLs.
if (!html.includes('article-route-runtime.js')) {
  const runtime = '<script src="/article-route-runtime.js?v=20260819-seo-v5"></script>';
  const articleHome = html.match(/<script\s+src=["']\.\/articles-home\.js(?:\?[^"']*)?["'][^>]*><\/script>/i)?.[0] || '';
  if (articleHome) html = html.replace(articleHome, `${runtime}${articleHome}`);
  else html = html.replace('</body>', `  ${runtime}\n  </body>`);
}

// Core homepage scripts are aggressively cached on the CDN/browser. Normalize
// their cache tokens at build time so a production deploy cannot serve an older
// renderer after the underlying file changed.
const coreVersions = new Map([
  ['article-route-runtime.js', '20260819-seo-v5'],
  ['articles-home.js', '20260819-single-bundle-2'],
  ['ice-home-unify.js', '20260819-preserve-sections-2'],
  ['topic-focus.js', '20260819-live-2'],
  ['homepage-refresh-guard.js', '20260819-single-live-1'],
  ['articles-home-live-fix.js', '20260819-compat-shim-1']
]);
for (const [asset, version] of coreVersions) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(<script\\s+[^>]*src=["'](?:\\./|/)${escaped})(?:\\?[^"']*)?(["'][^>]*><\\/script>)`, 'gi');
  html = html.replace(re, `$1?v=${version}$2`);
}

// Prefer canonical category routes in the static homepage shell as well.
const canonicalCategories = new Map([
  ['重要新闻', '/important-news'],
  ['热门头条', '/hot-headlines'],
  ['美国时政', '/us-politics'],
  ['美国警情', '/us-crime'],
  ['中国官场', '/china-officialdom'],
  ['移民美国', '/immigration'],
  ['庇护百科', '/asylum']
]);
for (const [name, route] of canonicalCategories) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`\\.\\/listing\\.html\\?category=${escaped}`, 'g'), route);
}

// Root-relative critical assets are stable on every canonical route and avoid path-resolution regressions.
html = html
  .replace('href="./site.webmanifest?v=29.8"', 'href="/site.webmanifest?v=29.8"')
  .replace('href="./assets/icons/icon-192.png?v=20260725"', 'href="/assets/icons/icon-192.png?v=20260725"')
  .replace('href="./trrb-logo-cropped.webp" as="image"', 'href="/trrb-logo-cropped.webp" as="image"')
  .replace('src="./trrb-logo-cropped.webp" alt="唐人日报 Tang Ren Daily"', 'src="/trrb-logo-cropped.webp" alt="唐人日报 Tang Ren Daily"');

if (html === before) {
  console.log('Homepage optimizer: no changes required');
  process.exit(0);
}

fs.writeFileSync(file, html);
console.log(`Homepage optimizer: removed ${removedChunks} redundant archive chunks; normalized canonical routes and core cache versions`);
