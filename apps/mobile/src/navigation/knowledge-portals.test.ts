import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgePortalUrl, knowledgePortals } from './knowledge-portals.ts';
test('knowledge landing pages and every subcategory resolve to the canonical PC destination', () => {
  assert.equal(knowledgePortalUrl('immigration'), 'https://trrb.net/immigrate/');
  assert.equal(knowledgePortalUrl('legal'), 'https://trrb.net/legal/');
  for (const path of knowledgePortals.immigration.paths) assert.equal(knowledgePortalUrl('immigration', path), `https://trrb.net/immigrate/center?path=${path}`);
  for (const source of knowledgePortals.legal.paths) assert.equal(knowledgePortalUrl('legal', source), `https://trrb.net/legal/?source=${source}`);
  assert.equal(knowledgePortalUrl('immigration', 'SCOTUS'), 'https://trrb.net/immigrate/');
  assert.equal(knowledgePortalUrl('legal', 'https://example.com'), 'https://trrb.net/legal/');
});
