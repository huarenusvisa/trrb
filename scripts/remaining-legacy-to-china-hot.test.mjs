import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../supabase/migrations/20260901133000_remaining_legacy_to_china_hot.sql', import.meta.url),
  'utf8'
);

assert.match(sql, /array_length\(mismatch_ids,\s*1\)\s*<>\s*59/i);
assert.match(sql, /array_length\(orphan_legacy_ids,\s*1\)\s*<>\s*7/i);
assert.match(sql, /array_length\(alias_legacy_ids,\s*1\)\s*<>\s*8/i);
assert.match(sql, /batch_count\s*<>\s*74/i);
assert.match(sql, /legacy_alias_ids/i, 'duplicate old IDs must be stored as aliases');
assert.match(sql, /legacy_ai_expansion'\s*,\s*false/i, 'historical text must not be AI expanded');
assert.match(sql, /canonical_url\s*!~\s*'\^https:\/\/trrb\\\.net\/hot-headlines\/'/i);

for (const oldId of ['wp-117169','wp-116721','wp-116630','wp-116576','wp-116413','wp-116193','wp-115785','wp-113106','wp-110473','wp-110324','wp-101429','wp-97343','wp-94620','wp-94546','wp-93238']) {
  assert.ok(sql.includes(oldId), `${oldId} is missing from the final closure map`);
}

for (const updateBlock of sql.matchAll(/update\s+public\.articles[\s\S]*?where\s+a\.(?:legacy_id|id)\s*=/gi)) {
  assert.doesNotMatch(updateBlock[0], /\b(?:title|summary|content)\s*=/i, 'article text must remain verbatim');
}

console.log('remaining 59 conflicts + 15 old IDs -> 中国热门头条 contract passed');
