#!/usr/bin/env node

import fs from 'node:fs';

const source = fs.readFileSync('netlify/edge-functions/news-sitemap-live.ts', 'utf8');
const realtimeAudit = fs.readFileSync('scripts/round13-node3-seo-realtime-audit.mjs', 'utf8');
const productionProbe = fs.readFileSync('.github/workflows/netlify-build-hook-production-probe.yml', 'utf8');
const checks = [
  ['public-only publication gate remains', source.includes('status:"eq.published"') && source.includes('visibility:"eq.public"')],
  ['48-hour cutoff is pushed into the Data API query', source.includes('published_at:`gte.${cutoffIso}`')],
  ['recent articles are read with offset pagination', source.includes('offset:String(offset)') && source.includes('offset+=ARTICLE_PAGE_SIZE')],
  ['pagination stops only after a short page', source.includes('if(page.length<ARTICLE_PAGE_SIZE)return out')],
  ['a full safety cap fails instead of silently truncating', source.includes('refusing a truncated News Sitemap')],
  ['pagination order has a stable id tiebreaker', source.includes('published_at.desc.nullslast,created_at.desc,id.desc')],
  ['response advertises the paged contract', source.includes('live-supabase-v7-paged-public-only-ice-safe-dedupe')],
  ['realtime audit requires the paged contract', realtimeAudit.includes('/paged/i.test(newsVersion)') && !realtimeAudit.includes('/latest1000/i.test(newsVersion)')],
  ['production probe requires the paged contract', productionProbe.includes('news_sitemap_paged_live') && productionProbe.includes('live-supabase-v7-paged-public-only-ice-safe-dedupe')]
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) failed += 1;
}
if (failed) process.exit(1);
