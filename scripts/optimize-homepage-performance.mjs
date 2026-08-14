#!/usr/bin/env node
import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');
const before = html;

// The homepage renderer prefers articles-home-index.js and then refreshes from Supabase.
// Full article body chunks are therefore redundant on the homepage and add many initial requests.
let removedChunks = 0;
html = html.replace(/<script\s+src=["']\.\/articles-chunk-\d+\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi, () => {
  removedChunks += 1;
  return '';
});

// Avoid discovering a stylesheet at the very end of <body>, which can cause a late style recalculation.
const topicCss = '<link rel="stylesheet" href="./topic-feed.css?v=36">';
if (html.includes(topicCss)) {
  html = html.replace(topicCss, '');
  if (!html.includes('href="./topic-feed.css?v=36"')) {
    html = html.replace('</head>', `    ${topicCss}\n  </head>`);
  }
}

// Root-relative critical assets are stable on every canonical route and avoid path-resolution regressions.
html = html
  .replace('href="./site.webmanifest?v=29.8"', 'href="/site.webmanifest?v=29.8"')
  .replace('href="./assets/icons/icon-192.png?v=20260725"', 'href="/assets/icons/icon-192.png?v=20260725"')
  .replace('href="./trrb-logo-cropped.webp" as="image"', 'href="/trrb-logo-cropped.webp" as="image"')
  .replace('src="./trrb-logo-cropped.webp" alt="唐人日报 Tang Ren Daily"', 'src="/trrb-logo-cropped.webp" alt="唐人日报 Tang Ren Daily"');

if (html === before) {
  console.log('Round 11 homepage optimizer: no changes required');
  process.exit(0);
}

fs.writeFileSync(file, html);
console.log(`Round 11 homepage optimizer: removed ${removedChunks} redundant article chunk requests; promoted topic-feed.css to <head>`);
