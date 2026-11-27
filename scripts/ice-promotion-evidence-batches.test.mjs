import test from 'node:test';
import assert from 'node:assert/strict';
import {promotionEvidenceBatches} from './ice-trusted-source-promote.mjs';

test('reads at most eight stories concurrently and yields in source order', async () => {
  const rows = Array.from({length: 19}, (_, id) => ({id}));
  let active = 0, peak = 0;
  const observed = [];
  for await (const item of promotionEvidenceBatches(rows, async (story) => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, (8 - story.id % 8)));
    active--;
    return [{id: `evidence-${story.id}`}];
  })) observed.push(item);
  assert.equal(peak, 8);
  assert.equal(active, 0);
  assert.deepEqual(observed, rows.map(story => ({story, evidence: [{id: `evidence-${story.id}`}]})));
});

test('does not read evidence for manually handled stories', async () => {
  const rows = [
    {id: 0, human_review_status: 'editing'},
    {id: 1, human_review_status: 'approved'},
    {id: 2, human_review_status: 'rejected'},
    {id: 3, reviewed_by: 'editor'},
    {id: 4, human_review_status: 'required'},
  ];
  const calls = [], results = [];
  for await (const item of promotionEvidenceBatches(rows, async story => {
    calls.push(story.id); return [];
  })) results.push(item);
  assert.deepEqual(calls, [4]);
  assert.deepEqual(results.map(item => item.evidence), [null, null, null, null, []]);
});

test('failed evidence read stops the batch before any decision can be yielded', async () => {
  const yielded = [];
  await assert.rejects(async () => {
    for await (const item of promotionEvidenceBatches([{id: 0}, {id: 1}], async story => {
      if (story.id === 1) throw new Error('evidence unavailable');
      return [];
    })) yielded.push(item);
  }, /evidence unavailable/);
  assert.deepEqual(yielded, []);
});
