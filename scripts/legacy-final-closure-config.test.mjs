import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(
  await readFile(new URL('../config/legacy-archive-final-closure-20260829.json', import.meta.url), 'utf8')
);
const ids = config.manual_review_legacy_ids;

assert.equal(config.operation_id, 'legacy-archive-final-closure-20260829');
assert.equal(config.apply, true);
assert.ok(Array.isArray(ids));
assert.equal(ids.length, 46);
assert.equal(new Set(ids).size, ids.length);
assert.ok(ids.every((id) => /^wp-\d+$/.test(id)));

console.log('legacy final closure config passed');
