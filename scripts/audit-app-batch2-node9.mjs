import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
}

const api = read('apps/mobile/src/api/trrb.ts');
const detail = read('apps/mobile/app/article/[id].tsx');
const cache = read('apps/mobile/src/storage/articleCache.ts');
const list = read('apps/mobile/src/components/PaginatedNewsList.tsx');

check('requests have explicit timeout', api.includes('REQUEST_TIMEOUT_MS') && api.includes('AbortController'));
check('transient failures retry with bounded attempts', api.includes('MAX_RETRIES') && api.includes('attempt < MAX_RETRIES'));
check('duplicate concurrent GET requests are coalesced', api.includes('const inflight = new Map') && api.includes('inflight.get(url)'));
check('article cache persists successful production reads', cache.includes('AsyncStorage') && detail.includes('cacheArticle(row)'));
check('offline article fallback is wired into detail page', detail.includes('readCachedArticle(id, true)') && detail.includes('离线副本'));
check('confirmed unpublished article clears stale cache', detail.includes('removeCachedArticle(id)'));
check('offline state never masquerades as fresh online state', detail.includes('setOffline(true)') && detail.includes('重新连接'));
check('loading skeleton is rendered for article detail', detail.includes('styles.skeleton') && detail.includes('styles.sk4'));
check('image caching is enabled for article cover', detail.includes("cache: 'force-cache'"));
check('news lists expose refresh, pagination and recovery state', list.includes('RefreshControl') && list.includes('onEndReached') && list.includes('setError'));
check('cached articles are age-aware', cache.includes('MAX_AGE_MS') && cache.includes('allowStale'));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`APP-R2-N9 FAIL (${failed.length}/${checks.length} checks failed)`);
  process.exit(1);
}
console.log(`APP-R2-N9 PASS (${checks.length}/${checks.length})`);
