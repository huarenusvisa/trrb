import assert from 'node:assert/strict';
import test from 'node:test';
import { nextNewsImagePrefetchWindow } from './news-image-prefetch-core.ts';

const items = Array.from({ length: 12 }, (_, index) => ({ cover_image: index === 6 ? undefined : `image-${index}` }));

test('prefetches only the next bounded window after visible rows', () => {
  assert.deepEqual(nextNewsImagePrefetchWindow(items, [1, 2, 3], -1), {
    uris: ['image-4', 'image-5', undefined, 'image-7'],
    prefetchedThrough: 7,
  });
});

test('does not repeat a window until the visible range passes its cursor', () => {
  assert.equal(nextNewsImagePrefetchWindow(items, [4, 5], 7), null);
  assert.deepEqual(nextNewsImagePrefetchWindow(items, [7], 7, 2), {
    uris: ['image-8', 'image-9'],
    prefetchedThrough: 9,
  });
});

test('ignores invalid visibility updates and stops at the end of the feed', () => {
  assert.equal(nextNewsImagePrefetchWindow(items, [null, -1], -1), null);
  assert.equal(nextNewsImagePrefetchWindow(items, [11], 10), null);
});
