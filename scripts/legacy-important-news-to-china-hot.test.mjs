import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../supabase/migrations/20260901124500_legacy_important_news_to_china_hot.sql', import.meta.url),
  'utf8'
);

assert.match(sql, /candidate_count\s*<>\s*400/i, 'migration must pin the reviewed 400-row set');
assert.match(sql, /length\(regexp_replace[\s\S]*?<\s*180/i, 'migration must reject incomplete bodies');
assert.match(sql, /legacy_id\s+is\s+not\s+null[\s\S]*?category_name\s*=\s*'重要新闻'/i);
assert.match(sql, /legacy_ai_expansion'\s*,\s*false/i, 'migration must record that no AI expansion occurred');
assert.match(sql, /legacy_previous_canonical_url/i, 'migration must retain the previous route for 301 evidence');
assert.match(sql, /replace\(canonical_url,\s*'\/important-news\/',\s*'\/hot-headlines\/'\)/i);

const updateBlock = sql.match(/update\s+public\.articles[\s\S]*?where\s+legacy_id\s+is\s+not\s+null/i)?.[0] || '';
assert.ok(updateBlock, 'article update block is missing');
assert.doesNotMatch(updateBlock, /\b(?:title|summary|content)\s*=/i, 'historical article text must remain verbatim');

console.log('legacy 重要新闻 -> 中国热门头条 migration contract passed');
