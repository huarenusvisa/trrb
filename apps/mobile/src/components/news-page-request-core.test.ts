import assert from 'node:assert/strict';
import test from 'node:test';
import { NewsPageRequestGate } from './news-page-request-core.ts';

test('deduplicates refresh and append requests before React state updates', () => {
  const gate = new NewsPageRequestGate();
  gate.resetFeed();
  const append = gate.startAppend(24);
  assert.ok(append);
  assert.equal(gate.startAppend(24), null);
  assert.equal(gate.finish(append), true);
  assert.ok(gate.startAppend(24));

  const refresh = gate.startRefresh();
  assert.ok(refresh);
  assert.equal(gate.startRefresh(), null);
  assert.equal(gate.startAppend(24), null);
});

test('refresh invalidates a pending append response', () => {
  const gate = new NewsPageRequestGate();
  gate.resetFeed();
  const append = gate.startAppend(24);
  assert.ok(append);
  const refresh = gate.startRefresh();
  assert.ok(refresh);
  assert.equal(gate.isCurrent(append), false);
  assert.equal(gate.finish(append), false);
  assert.equal(gate.isCurrent(refresh), true);
});

test('feed reset invalidates every request from the previous category', () => {
  const gate = new NewsPageRequestGate();
  const firstGeneration = gate.resetFeed();
  const append = gate.startAppend(48);
  assert.ok(append);
  const nextGeneration = gate.resetFeed();
  assert.notEqual(nextGeneration, firstGeneration);
  assert.equal(gate.isCurrent(append), false);
  assert.equal(gate.isCurrent(nextGeneration), true);
});
