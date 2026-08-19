import fs from 'node:fs';

// This command is intentionally read-only. It used to rewrite listing/homepage
// runtime files to a 2026-08-16 architecture and could roll back newer SEO and
// unified-bundle fixes if run manually.

const files = {
  listingHtml: fs.readFileSync('listing.html', 'utf8'),
  listingJs: fs.readFileSync('listing.js', 'utf8'),
  listingSeo: fs.readFileSync('listing-seo.js', 'utf8'),
  home: fs.readFileSync('articles-home.js', 'utf8'),
  guard: fs.readFileSync('homepage-refresh-guard.js', 'utf8'),
  shim: fs.readFileSync('articles-home-live-fix.js', 'utf8'),
  bundle: fs.readFileSync('netlify/functions/public-home-bundle.js', 'utf8'),
  optimizer: fs.readFileSync('scripts/optimize-homepage-performance.mjs', 'utf8')
};

const checks = [
  ['listing canonical runtime is current', files.listingHtml.includes('listing.js?v=20260819-seo-v2')],
  ['listing pretty-route SEO is loaded', files.listingHtml.includes('listing-seo.js?v=20260819-pretty-category-2')],
  ['listing SEO knows pretty categories', files.listingSeo.includes('prettyCategoryByPath') && files.listingSeo.includes("'/immigration': '移民美国'")],
  ['homepage uses unified bundle', files.home.includes('fetchUnifiedHomeBundle') && files.home.includes('public-home-bundle')],
  ['refresh guard uses one unified bundle', files.guard.includes('public-home-bundle')],
  ['refresh guard preserves category supplements', files.guard.includes('4d-core-plus-category-supplements')],
  ['compat shim is interval-free', files.shim.includes('TRRB_HOME_LIVE_COMPAT_SHIM') && !files.shim.includes('setInterval')],
  ['backend supplement queries are conditional', files.bundle.includes('sparseCategories') && files.bundle.includes('database_queries')],
  ['optimizer owns current homepage cache versions', files.optimizer.includes('20260819-bundle-supplements-2') && files.optimizer.includes('20260819-reuse-bundle-2')]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}

console.log(`MODULE_SINGLE_SOURCE_READ_ONLY_AUDIT=true checks=${checks.length} failures=${failures}`);
if (failures) process.exit(1);
