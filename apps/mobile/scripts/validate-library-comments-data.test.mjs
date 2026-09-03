import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260903181948_mobile_library_comments_production_closure.sql', import.meta.url),
  'utf8',
);
const indexes = fs.readFileSync(
  new URL('../../../supabase/migrations/20260903182507_mobile_library_comments_indexes.sql', import.meta.url),
  'utf8',
);

test('creates the existing mobile comments and library data model', () => {
  for (const table of ['comments', 'comment_likes', 'comment_reports', 'favorites', 'reading_history']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table} \\(`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test('keeps favorites and history private to the unified account owner', () => {
  assert.match(migration, /create policy "favorites owner all"[\s\S]*auth\.uid\(\)\)=user_id/);
  assert.match(migration, /create policy "history owner all"[\s\S]*auth\.uid\(\)\)=user_id/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all)[^;]*(?:favorites|reading_history)[^;]* to anon/);
});

test('limits comment writes and exposes deletion only through the owner RPC', () => {
  assert.match(migration, /grant select, insert on public\.comments to authenticated/);
  assert.doesNotMatch(migration, /grant update[^;]*public\.comments to authenticated/);
  assert.match(migration, /where id=p_comment_id and user_id=auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.delete_own_comment\(uuid\) to authenticated/);
});

test('checks public article state, actor status, and abuse limits', () => {
  assert.match(migration, /a\.status='published'/);
  assert.match(migration, /coalesce\(a\.visibility,'public'\)='public'/);
  assert.match(migration, /actor_status is distinct from 'active'/);
  assert.match(migration, /recent_count >= 8/);
  assert.match(migration, /recent_count >= 20/);
});

test('covers user foreign keys reported by database advisors', () => {
  assert.match(indexes, /comment_likes\(user_id\)/);
  assert.match(indexes, /comment_reports\(reporter_user_id, created_at desc\)/);
});
