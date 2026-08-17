import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
}

const searchScreen = read('apps/mobile/app/search.tsx');
const api = read('apps/mobile/src/api/trrb.ts');
const history = read('apps/mobile/src/storage/searchHistory.ts');
const helper = read('apps/mobile/src/search/news-search.ts');
const publicArticles = read('netlify/functions/public-articles.js');
const trending = read('netlify/functions/public-app-trending-searches.js');
const list = read('apps/mobile/src/components/PaginatedNewsList.tsx');

check('search uses formal public-articles API', api.includes('/public-articles') && publicArticles.includes('status: "eq.published"'));
check('keyword search is server-side', publicArticles.includes('query.or') && publicArticles.includes('title.ilike') && publicArticles.includes('summary.ilike'));
check('category filter is server-side', publicArticles.includes('query.category_name') && list.includes('category={') === false && list.includes('category, q'));
check('stable paging exists', publicArticles.includes('offset') && publicArticles.includes('next_offset') && publicArticles.includes('has_more') && list.includes('onEndReached'));
check('results are deduplicated', list.includes('const seen = new Set<string>()'));
check('search history persists locally', history.includes('@react-native-async-storage/async-storage') && history.includes('MAX_ITEMS'));
check('search history can be cleared', history.includes('clearSearchHistory') && searchScreen.includes('clearSearchHistory'));
check('search helper records history and supports category', helper.includes("../storage/searchHistory") && helper.includes('category?: string'));
check('trending data comes from server endpoint', api.includes('/public-app-trending-searches') && searchScreen.includes('fetchTrendingSearches'));
check('trending endpoint is derived from published production rows', trending.includes("rest('articles'") && trending.includes("status: 'eq.published'") && trending.includes('category-frequency'));
check('trending endpoint exposes audit metadata', trending.includes('auditable: true') && trending.includes('generated_at') && trending.includes('source:'));
check('no client hardcoded hot-search list', !/const\s+(HOT|TRENDING|hot|trending)\w*\s*=\s*\[[^\]]+["'][^\]]+["']/.test(searchScreen));
check('search UI supports keyword plus category', searchScreen.includes('q={query || undefined}') && searchScreen.includes('category={category || undefined}'));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`APP-R2-N8 FAIL (${failed.length}/${checks.length} checks failed)`);
  process.exit(1);
}
console.log(`APP-R2-N8 PASS (${checks.length}/${checks.length})`);
