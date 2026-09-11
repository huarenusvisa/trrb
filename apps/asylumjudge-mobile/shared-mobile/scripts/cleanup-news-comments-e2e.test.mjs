import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupNewsCommentsE2e } from './cleanup-news-comments-e2e.mjs';

const env = {
  MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'trrb-e2e-mobile@example.invalid',
  MAESTRO_TEST_ACCOUNT_PASSWORD: 'marked-test-password',
  MAESTRO_TEST_CONTENT_SUFFIX: 'run-123456',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
};

test('deletes only marked comments owned by the authenticated test user', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('unified-account-login')) return new Response(JSON.stringify({ session: { access_token: 'user-jwt', user: { id: 'user-1' } } }));
    if (init.method === 'GET') return new Response(JSON.stringify([
      { id: 'safe-1', user_id: 'user-1', content: 'TRRB-E2E-run-123456 新闻评论闭环测试', status: 'published' },
      { id: 'other-1', user_id: 'user-2', content: 'TRRB-E2E-run-123456 其他用户内容', status: 'published' },
      { id: 'real-1', user_id: 'user-1', content: '真实评论', status: 'published' },
      { id: 'deleted-1', user_id: 'user-1', content: 'TRRB-E2E-run-123456 旧内容', status: 'deleted' },
    ]));
    return new Response(JSON.stringify(true));
  };
  assert.equal(await cleanupNewsCommentsE2e(env, fetchImpl), 1);
  const lookup = calls.find((call) => call.init.method === 'GET');
  const lookupUrl = new URL(lookup.url);
  assert.equal(lookupUrl.searchParams.get('user_id'), 'eq.user-1');
  assert.equal(lookupUrl.searchParams.get('content'), 'like.*TRRB-E2E-run-123456*');
  const deletes = calls.filter((call) => call.url.includes('/rpc/delete_own_comment'));
  assert.equal(deletes.length, 1);
  assert.deepEqual(JSON.parse(deletes[0].init.body), { p_comment_id: 'safe-1' });
  assert.equal(deletes[0].init.headers.Authorization, 'Bearer user-jwt');
  assert.equal(deletes[0].init.headers.apikey, 'public-anon-key');
});

test('does not call the delete RPC when no exact run marker exists', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('unified-account-login')) return new Response(JSON.stringify({ session: { access_token: 'user-jwt', user: { id: 'user-1' } } }));
    return new Response(JSON.stringify([{ id: 'real', user_id: 'user-1', content: 'TRRB-E2E-other-run 测试', status: 'published' }]));
  };
  assert.equal(await cleanupNewsCommentsE2e(env, fetchImpl), 0);
  assert.equal(calls.some((url) => url.includes('/rpc/delete_own_comment')), false);
});
