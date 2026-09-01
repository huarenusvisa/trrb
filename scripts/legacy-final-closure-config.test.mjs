import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(
  await readFile(new URL('../config/legacy-archive-final-closure-20260829.json', import.meta.url), 'utf8')
);
const ids = config.manual_review_legacy_ids;
const approved = config.approved_manual_review_categories;
const allowedCategories = new Set(['ICE执法动态', '美国时政', '美国警情', '移民美国', '中国热门头条']);

assert.equal(config.operation_id, 'legacy-archive-final-closure-20260829');
assert.equal(config.apply, true);
assert.ok(Array.isArray(ids));
assert.equal(ids.length, 46);
assert.equal(new Set(ids).size, ids.length);
assert.ok(ids.every((id) => /^wp-\d+$/.test(id)));
assert.equal(config.revision, 8);
assert.equal(Object.keys(approved).length, 1193);
assert.equal(new Set(Object.keys(approved)).size, 1193);
assert.ok(Object.keys(approved).every((id) => /^wp-\d+$/.test(id)));
assert.ok(Object.values(approved).every((category) => allowedCategories.has(category)));
assert.ok(ids.every((id) => approved[id]), 'every previously forced manual-review ID must now have an approved category');

console.log('legacy final closure config passed');
