import fs from 'node:fs';

// Historical note: this file used to mutate articles-home.js, index.html and
// articles-home-live-fix.js into an older single-source design. Keeping a
// destructive fixer around is dangerous now that the homepage architecture is
// owned by public-home-bundle + homepage-refresh-guard. This command is therefore
// intentionally read-only and only validates the current architecture.

const files = {
  home: fs.readFileSync('articles-home.js', 'utf8'),
  guard: fs.readFileSync('homepage-refresh-guard.js', 'utf8'),
  hub: fs.readFileSync('homepage-immigration-hub.js', 'utf8'),
  shim: fs.readFileSync('articles-home-live-fix.js', 'utf8'),
  bundle: fs.readFileSync('netlify/functions/public-home-bundle.js', 'utf8'),
  optimizer: fs.readFileSync('scripts/optimize-homepage-performance.mjs', 'utf8')
};

const checks = [
  ['articles-home uses unified bundle', files.home.includes('fetchUnifiedHomeBundle') && files.home.includes('public-home-bundle')],
  ['homepage renderer exported', files.home.includes('window.renderHome = renderHome')],
  ['4-day section freshness remains', files.home.includes('HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000')],
  ['refresh guard uses unified bundle', files.guard.includes('public-home-bundle')],
  ['refresh guard preserves supplements', files.guard.includes('4d-core-plus-category-supplements')],
  ['knowledge hub reuses rendered bundle', files.hub.includes('TRRB_LAST_HOME_ARTICLES')],
  ['knowledge hub has no direct Supabase endpoint', !files.hub.includes('fwiznbpsqkfgkvyznebz.supabase.co')],
  ['compat shim has no interval', files.shim.includes('TRRB_HOME_LIVE_COMPAT_SHIM') && !files.shim.includes('setInterval')],
  ['bundle uses sparse category supplements', files.bundle.includes('sparseCategories') && files.bundle.includes('database_queries')],
  ['optimizer owns current guard cache token', files.optimizer.includes('20260819-bundle-supplements-2')],
  ['optimizer owns current hub cache token', files.optimizer.includes('20260819-reuse-bundle-2')]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}

console.log(`HOME_SINGLE_SOURCE_READ_ONLY_AUDIT=true checks=${checks.length} failures=${failures}`);
if (failures) process.exit(1);
