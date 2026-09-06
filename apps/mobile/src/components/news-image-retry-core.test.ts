import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IMAGE_FAILURE_COOLDOWN_MS,
  IMAGE_FIRST_RETRY_DELAY_MS,
  imageFailureKeysToPrune,
  imageRetryDelay,
  nextImageFailure,
} from './news-image-retry-core.ts';

test('image failures retry once quickly and then enter a shared cooldown', () => {
  const first = nextImageFailure(undefined, 1_000);
  assert.equal(imageRetryDelay(first, 1_000), IMAGE_FIRST_RETRY_DELAY_MS);
  assert.equal(nextImageFailure(first, 1_100), first);
  const second = nextImageFailure(first, first.retryAt);
  assert.equal(second.attempts, 2);
  assert.equal(imageRetryDelay(second, first.retryAt), IMAGE_FAILURE_COOLDOWN_MS);
});

test('image retry delay expires without becoming negative', () => {
  const failure = nextImageFailure(undefined, 1_000);
  assert.equal(imageRetryDelay(failure, failure.retryAt + 1), 0);
});

test('image failure pruning keeps only the newest bounded entries', () => {
  const state = (lastFailureAt: number) => ({ attempts: 1, retryAt: lastFailureAt + 900, lastFailureAt });
  assert.deepEqual(imageFailureKeysToPrune([
    { key: 'old', state: state(1) }, { key: 'new', state: state(3) }, { key: 'middle', state: state(2) },
  ], 2), ['old']);
});
