import { pathToFileURL } from 'node:url';
import { validateAuthE2eEnvironment } from './validate-auth-e2e-env.mjs';

const ACCOUNT_API = 'https://trrb.net/.netlify/functions/unified-account-login';
const COMMUNITY_API = 'https://trrb.net/.netlify/functions/community-api';
const TEST_TITLE_PREFIX = '【TRRB-E2E-';
const TEST_CONTENT_MARKER = 'TRRB 自动化测试内容，无真实用户信息';

async function jsonRequest(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `request_failed_${response.status}`);
  return payload;
}

export async function cleanupCommunityE2e(env, fetchImpl = fetch) {
  const failures = validateAuthE2eEnvironment(env);
  if (failures.length) throw new Error(`cleanup_preflight_failed: ${failures.join('; ')}`);

  const login = await jsonRequest(fetchImpl, ACCOUNT_API, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: String(env.MAESTRO_TEST_ACCOUNT_IDENTIFIER).trim(),
      password: String(env.MAESTRO_TEST_ACCOUNT_PASSWORD),
    }),
  });
  const token = login?.session?.access_token;
  if (!token) throw new Error('cleanup_login_returned_no_session');
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const feed = await jsonRequest(fetchImpl, COMMUNITY_API, { method: 'GET', headers });
  const candidates = (Array.isArray(feed.posts) ? feed.posts : []).filter((post) =>
    typeof post?.title === 'string'
    && post.title.startsWith(TEST_TITLE_PREFIX)
    && typeof post?.content === 'string'
    && post.content.includes(TEST_CONTENT_MARKER)
    && post.status !== 'deleted'
  );
  for (const post of candidates) {
    await jsonRequest(fetchImpl, COMMUNITY_API, {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'unpublish_post', post_id: post.id }),
    });
  }
  return candidates.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanupCommunityE2e(process.env)
    .then((count) => console.log(`Community E2E cleanup: ${count} marked post(s) unpublished`))
    .catch((error) => {
      console.error(`Community E2E cleanup failed: ${error.message}`);
      process.exit(1);
    });
}
