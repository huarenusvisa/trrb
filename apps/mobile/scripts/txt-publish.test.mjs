import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/social/txt-publish.ts', import.meta.url), 'utf8');
function harness({ fail = false, prior = false, pending = false } = {}) {
  const calls = [], receipts = new Map(prior ? [['receipt', 'already-sent']] : []);
  const client = { auth: { setSession: async () => ({ error: null }), getUser: async () => ({ data: { user: { id: 'txt-user' } } }), signOut: async options => calls.push(['signout', options.scope]), stopAutoRefresh: () => {} } };
  const context = { Error, JSON, Date, isAuthConfigured: true, publicConfig: { url: 'test', key: 'public' },
    AsyncStorage: { getItem: async () => receipts.get('receipt'), setItem: async (_key, value) => receipts.set('receipt', value) },
    Crypto: { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async () => 'digest' },
    txtReceiptInput: () => 'content-without-password',
    createClient: (_url, _key, options) => { calls.push(['client', options]); return client; },
    loginOrRegister: async (_identifier, _password, options) => { calls.push(['login', options]); return { session: { access_token: 'token', refresh_token: 'refresh' } }; },
    createCommunityApi: ({ getAccessToken }) => ({ createPost: async () => { calls.push(['publish', await getAccessToken()]); if (fail) throw new Error('timeout'); return { post: { id: 'post-1', user_id: 'txt-user', status: pending ? 'pending' : 'published' } }; } }),
  };
  vm.createContext(context);
  const body = source.replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
  vm.runInContext(ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nthis.publish = publishTxtPost;', context);
  return { calls, receipts, publish: () => context.publish({ identifier: 'a@example.com', password: 'secret-password', target: 'community', title: '标题', category: 'hot_discussion', content: '正文' }, () => {}) };
}
test('uses isolated nonpersistent auth, existing login and local-only cleanup', async () => {
  const h = harness({ pending: true }); const result = await h.publish();
  assert.equal(result.pending, true);
  assert.equal(h.calls.find(c => c[0] === 'client')[1].auth.persistSession, false);
  assert.equal(h.calls.find(c => c[0] === 'login')[1].loginOnly, true);
  assert.equal(h.calls.at(-1)[1], 'local');
  assert.ok(!h.receipts.get('receipt').includes('secret-password'));
});
test('repeat import never logs in or writes again', async () => {
  const h = harness({ prior: true }); await assert.rejects(h.publish(), /已有发送记录/); assert.equal(h.calls.length, 0);
});
test('uncertain network result keeps marker and refuses duplicate send', async () => {
  const h = harness({ fail: true }); await assert.rejects(h.publish(), /不会自动重复发送/);
  assert.equal(JSON.parse(h.receipts.get('receipt')).state, 'sending');
  await assert.rejects(h.publish(), /已有发送记录/);
  assert.equal(h.calls.filter(c => c[0] === 'publish').length, 1);
});
