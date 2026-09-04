import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const list = await readFile(new URL('../src/components/PaginatedNewsList.tsx', import.meta.url), 'utf8');
const image = await readFile(new URL('../src/components/NewsImage.tsx', import.meta.url), 'utf8');

test('restores homepage and list snapshots before refreshing official news', () => {
  assert.match(home, /readCachedHomeFeed/);
  assert.match(home, /cacheHomeFeed\(merged, focus\)/);
  assert.match(list, /readCachedNewsPage\(category, q\)/);
  assert.match(list, /cacheNewsPage\(category, q, page\.articles/);
  assert.match(home, /正在显示上次读取的新闻/);
  assert.match(list, /t\('news\.offline'\)/);
});

test('uses the shared image fallback across homepage and category cards', () => {
  assert.doesNotMatch(home, /<Image\s/);
  assert.doesNotMatch(list, /<Image\s/);
  assert.match(home, /<NewsImage/g);
  assert.match(list, /<NewsImage/);
  assert.match(image, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(image, /新闻图片暂不可用/);
});
