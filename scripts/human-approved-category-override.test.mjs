import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../supabase/migrations/20260901115000_human_approved_legacy_category_override.sql', import.meta.url),
  'utf8',
);

assert.match(
  sql,
  /if\s+approved_category\s+is\s+null\s+or\s+approved_category\s+not\s+in/i,
  'an absent human override must return before the active-category lookup',
);
assert.match(sql, /if\s+target\.id\s+is\s+null\s+then/i);
assert.match(sql, /new\.category_id\s*:=\s*target\.id/i);

console.log('null human category overrides pass through; explicit overrides remain enforced');
