import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../SUPABASE-ICE-V2-MIGRATION.sql', import.meta.url), 'utf8').toLowerCase();

test('migration is idempotent and preserves historical data', () => {
  assert.match(sql, /create table if not exists public\.ice_query_state/);
  assert.match(sql, /create table if not exists public\.ice_posts/);
  assert.match(sql, /create table if not exists public\.ice_stories/);
  assert.match(sql, /create table if not exists public\.ice_story_evidence/);
  assert.match(sql, /create table if not exists public\.ice_review_logs/);
  assert.doesNotMatch(sql, /drop table/);
  assert.doesNotMatch(sql, /truncate table/);
  assert.doesNotMatch(sql, /delete\s+from/);
});

test('migration contains fields required by collector review and publisher', () => {
  for (const token of [
    'raw_payload jsonb',
    'event_fingerprint text',
    'processing_status text',
    'ai_payload jsonb',
    'human_review_status text',
    'final_title text',
    'final_content text',
    'source_post_id text',
    'metadata jsonb'
  ]) assert.ok(sql.includes(token), `missing ${token}`);
});

test('private ICE tables remain service-role only', () => {
  for (const table of ['ice_query_state','ice_posts','ice_stories','ice_story_evidence','ice_review_logs']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
    assert.ok(sql.includes(`revoke all on table public.${table} from anon, authenticated`));
    assert.ok(sql.includes(`grant all on table public.${table} to service_role`));
  }
});
