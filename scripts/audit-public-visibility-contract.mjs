import fs from 'node:fs';

const checks = [
  ['netlify/functions/public-home-bundle.js', ['visibility: "eq.public"']],
  ['netlify/functions/public-home-articles.js', ['visibility: "eq.public"']],
  ['netlify/functions/public-category-page.js', ['url.searchParams.set("visibility", "eq.public")']],
  ['netlify/functions/public-article.js', ["visibility: 'eq.public'"]],
  ['netlify/functions/public-articles.js', ['visibility: "eq.public"']],
  ['netlify/functions/public-app-trending-searches.js', ["visibility: 'eq.public'"]],
  ['netlify/functions/ice-published-stats.js', ["url.searchParams.set('visibility', 'eq.public')"]],
  ['netlify/functions/immigration-knowledge-stats.js', ["visibility: 'eq.public'"]],
  ['netlify/edge-functions/sitemap-live.ts', ['visibility: "eq.public"']],
  ['netlify/edge-functions/news-sitemap-live.ts', ['visibility:"eq.public"']],
  ['netlify/edge-functions/feed-live.ts', ['visibility:"eq.public"']],
  ['netlify/edge-functions/00-z-article-public-visibility.ts', ['private-hidden', 'visibility']],
  ['scripts/upgrade-article-urls.mjs', ["visibility: 'eq.public'", "filter-public-visibility-seo-feeds.mjs"]],
  ['scripts/filter-public-visibility-seo-feeds.mjs', ['visibility', 'nonpublic published article']],
  ['supabase/migrations/20260819202000_public_articles_visibility_policy.sql', ["status = 'published'", "visibility = 'public'"]]
];

const failures = [];
for (const [file, required] of checks) {
  if (!fs.existsSync(file)) {
    failures.push(`${file}: missing`);
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const marker of required) {
    if (!source.includes(marker)) failures.push(`${file}: missing public-visibility contract marker ${JSON.stringify(marker)}`);
  }
}

if (failures.length) {
  console.error(`PUBLIC VISIBILITY CONTRACT: FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`PUBLIC VISIBILITY CONTRACT: PASS (${checks.length} protected public read paths)`);
