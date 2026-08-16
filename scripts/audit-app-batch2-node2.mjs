import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const api = read('apps/mobile/src/api/trrb.ts');
const list = read('apps/mobile/src/components/PaginatedNewsList.tsx');
const category = read('apps/mobile/app/category/[name].tsx');
const categories = read('apps/mobile/src/news/categories.ts');

assert(api.includes('public-articles'), 'Node 2 FAIL: category/search pages must use production public-articles API');
assert(api.includes("params.set('offset'"), 'Node 2 FAIL: production article API must support offset pagination');
assert(api.includes('next_offset'), 'Node 2 FAIL: pagination must consume next_offset');
assert(api.includes('has_more'), 'Node 2 FAIL: pagination must consume has_more');
assert(list.includes('RefreshControl'), 'Node 2 FAIL: pull-to-refresh missing');
assert(list.includes('onEndReached'), 'Node 2 FAIL: infinite loading missing');
assert(list.includes('new Set<string>()'), 'Node 2 FAIL: duplicate record protection missing');
assert(list.includes('ListEmptyComponent'), 'Node 2 FAIL: empty state missing');
assert(list.includes('category, q'), 'Node 2 FAIL: category/query scoping is not explicit');
assert(category.includes('PaginatedNewsList'), 'Node 2 FAIL: category route is not wired to paginated list');
assert(categories.includes('NEWS_CATEGORIES'), 'Node 2 FAIL: shared category navigation model missing');
assert(!list.includes('mock') && !list.includes('fallbackArticles'), 'Node 2 FAIL: static/mock news fallback detected');

console.log('APP BATCH 2 NODE 2: PASS');
