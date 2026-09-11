import { pathToFileURL } from 'node:url';
import { validateAuthE2eEnvironment } from './validate-auth-e2e-env.mjs';

const ACCOUNT_API = 'https://trrb.net/.netlify/functions/unified-account-login';

async function jsonRequest(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || `request_failed_${response.status}`);
  return payload;
}

export async function cleanupNewsCommentsE2e(env, fetchImpl = fetch) {
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
  const userId = login?.session?.user?.id;
  if (!token || !userId) throw new Error('cleanup_login_returned_no_user_session');

  const baseUrl = String(env.EXPO_PUBLIC_SUPABASE_URL).replace(/\/$/, '');
  const anonKey = String(env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const marker = `TRRB-E2E-${String(env.MAESTRO_TEST_CONTENT_SUFFIX).trim()}`;
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}` };
  const query = new URLSearchParams({
    select: 'id,user_id,content,status',
    user_id: `eq.${userId}`,
    content: `like.*${marker}*`,
    status: 'in.(published,pending)',
    limit: '20',
  });
  const rows = await jsonRequest(fetchImpl, `${baseUrl}/rest/v1/comments?${query}`, { method: 'GET', headers });
  const candidates = (Array.isArray(rows) ? rows : []).filter((row) =>
    row?.user_id === userId
    && typeof row?.content === 'string'
    && row.content.includes(marker)
    && (row.status === 'published' || row.status === 'pending')
  );
  for (const row of candidates) {
    await jsonRequest(fetchImpl, `${baseUrl}/rest/v1/rpc/delete_own_comment`, {
      method: 'POST', headers, body: JSON.stringify({ p_comment_id: row.id }),
    });
  }
  return candidates.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanupNewsCommentsE2e(process.env)
    .then((count) => console.log(`News comments E2E cleanup: ${count} marked comment(s) deleted`))
    .catch((error) => {
      console.error(`News comments E2E cleanup failed: ${error.message}`);
      process.exit(1);
    });
}
