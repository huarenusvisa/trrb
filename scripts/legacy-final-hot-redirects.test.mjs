import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FINAL_HOT_LEGACY_REDIRECT_COUNT,
  finalHotCanonicalForLegacyId,
} from '../netlify/shared/legacy-final-hot-redirects.js';

const migration = await readFile(
  new URL('../supabase/migrations/20260901133000_remaining_legacy_to_china_hot.sql', import.meta.url),
  'utf8',
);

const reviewedIds = ['mismatch_ids', 'orphan_legacy_ids', 'alias_legacy_ids'].flatMap((name) => {
  const match = migration.match(new RegExp(`${name} text\\[\\] := array\\[([\\s\\S]*?)\\n  \\];`));
  assert.ok(match, `${name} must remain declared in the migration`);
  return [...match[1].matchAll(/'((?:wp-)?\d+)'/g)].map((entry) => entry[1]);
});

assert.equal(new Set(reviewedIds).size, 74, 'the reviewed closure batch must contain 74 unique old IDs');
assert.equal(FINAL_HOT_LEGACY_REDIRECT_COUNT, 82, '74 reviewed IDs plus 8 existing duplicate targets must be pinned');

for (const legacyId of reviewedIds) {
  const canonical = finalHotCanonicalForLegacyId(legacyId);
  assert.match(canonical, /^https:\/\/trrb\.net\/hot-headlines\//, `${legacyId} must point to 中国热门头条`);
  assert.equal(
    finalHotCanonicalForLegacyId(legacyId.replace(/^wp-/, '')),
    canonical,
    `${legacyId} numeric and wp-prefixed forms must share one canonical`,
  );
}

for (const route of [
  '../netlify/edge-functions/00-legacy-article-query-guard.ts',
  '../netlify/edge-functions/00-wordpress-query-rescue.ts',
  '../netlify/edge-functions/legacy-url-redirect.ts',
]) {
  const source = await readFile(new URL(route, import.meta.url), 'utf8');
  assert.match(source, /finalHotCanonicalForLegacyId/, `${route} must use the pinned reviewed redirect map`);
}

console.log('74 reviewed legacy IDs have database-independent 中国热门头条 redirects');
