import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupCommunityE2e } from './cleanup-community-e2e.mjs';

const env = {
  MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'trrb-e2e-mobile@example.invalid',
  MAESTRO_TEST_ACCOUNT_PASSWORD: 'marked-test-password',
  MAESTRO_TEST_CONTENT_SUFFIX: 'run-123456',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
};

test('only unpublishes doubly marked E2E posts with the test account token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('unified-account-login')) return new Response(JSON.stringify({ session: { access_token: 'user-jwt' } }));
    if (init.method === 'GET') return new Response(JSON.stringify({ posts: [
      { id: 'safe-1', title: '【TRRB-E2E-run-123456】社区闭环测试', content: 'TRRB 自动化测试内容，无真实用户信息；测试。', status: 'published' },
      { id: 'real-1', title: '【TRRB-E2E-经验分享】', content: '真实用户帖子', status: 'published' },
      { id: 'real-2', title: '普通帖子', content: 'TRRB 自动化测试内容，无真实用户信息', status: 'published' },
      { id: 'old-1', title: '【TRRB-E2E-old】社区闭环测试', content: 'TRRB 自动化测试内容，无真实用户信息', status: 'deleted' },
    ] }));
    return new Response(JSON.stringify({ ok: true }));
  };
  assert.equal(await cleanupCommunityE2e(env, fetchImpl), 1);
  const cleanup = calls.find((call) => String(call.init.body || '').includes('unpublish_post'));
  assert.deepEqual(JSON.parse(cleanup.init.body), { action: 'unpublish_post', post_id: 'safe-1' });
  assert.equal(cleanup.init.headers.Authorization, 'Bearer user-jwt');
});

test('does not write when no doubly marked post exists', async () => {
  const methods = [];
  const fetchImpl = async (url, init) => {
    methods.push(init.method);
    if (String(url).includes('unified-account-login')) return new Response(JSON.stringify({ session: { access_token: 'user-jwt' } }));
    return new Response(JSON.stringify({ posts: [{ id: 'real', title: '普通帖子', content: '真实内容', status: 'published' }] }));
  };
  assert.equal(await cleanupCommunityE2e(env, fetchImpl), 0);
  assert.deepEqual(methods, ['POST', 'GET']);
});
