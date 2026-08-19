import fs from 'node:fs';

// Read-only compatibility audit. This file used to patch listing.js,
// public-home-articles.js and articles-home.js in place. Running that old patch
// today would reintroduce per-category homepage fanout, so mutation is retired.

const files = {
  listing: fs.readFileSync('listing.js', 'utf8'),
  listingHtml: fs.readFileSync('listing.html', 'utf8'),
  publicArticles: fs.readFileSync('netlify/functions/public-home-articles.js', 'utf8'),
  bundle: fs.readFileSync('netlify/functions/public-home-bundle.js', 'utf8'),
  categoryEdge: fs.readFileSync('netlify/edge-functions/category-prerender.ts', 'utf8')
};

const checks = [
  ['listing requests exact live category', files.listing.includes('fetchLivePublishedArticles(200, category)')],
  ['listing sorts by publication time', files.listing.includes('articleTimestamp(b)-articleTimestamp(a)')],
  ['listing does not silently merge archive rows', files.listing.includes('Never silently repopulate a normal category page with stale archive rows')],
  ['public article endpoint supports category filtering', files.publicArticles.includes('query.category_name')],
  ['homepage bundle supplements only sparse categories', files.bundle.includes('sparseCategories') && files.bundle.includes('database_queries')],
  ['category edge emits crawlable snapshot', files.categoryEdge.includes('data-seo-category-snapshot="edge"')],
  ['current listing cache token is present', files.listingHtml.includes('listing.js?v=20260819-seo-v2')]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}
console.log(`CATEGORY_LIVE_ORDER_READ_ONLY_AUDIT=true checks=${checks.length} failures=${failures}`);
if (failures) process.exit(1);
