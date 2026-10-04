import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const source = fs.readFileSync(new URL('../../../netlify/functions/admin-txt-publish.mts', import.meta.url), 'utf8');
function harness({ denied = false, success = false, target = 'profile' } = {}) {
  const calls = [];
  const context = { Response, JSON, Error, Number, createHash, txtReceiptInput: post => JSON.stringify([post.identifier, post.content]),
    Netlify: { env: { get: () => 'public-key' } },
    admin: { SUPABASE_URL: 'https://auth.test', authenticateAdmin: async () => { calls.push('authorize'); if (denied) throw Object.assign(Error('denied'), { statusCode: 403 }); }, requestJson: async (url, options) => {
      if (url.endsWith('/user')) return { id: 'target-user' };
      calls.push(['insert', options]); return [{ id: 'new-post', status: 'published' }];
    } },
    parseTxtPost: () => ({ identifier: 'target@example.com', password: 'secret', target, category: 'hot_discussion', title: '', content: '正文 #纽约客' }),
    normalizeProfilePostTags: () => ['纽约客'],
    login: { handler: async () => { calls.push('login'); return success ? { statusCode: 200, body: JSON.stringify({ session: { access_token: 'target-token' } }) } : { statusCode: 401 }; } },
    community: { handler: async () => { calls.push('community'); return { statusCode: 201, body: JSON.stringify({ post: { id: 'community-post', status: 'pending' } }) }; } },
  };
  vm.createContext(context);
  const body = source.replace(/^import .*;\n/gm, '').replace('export default async', 'this.handler = async');
  vm.runInContext(ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { calls, run: action => context.handler({ method: 'POST', headers: new Headers(), json: async () => ({ action, txt: 'txt' }) }) };
}
test('non-admin stops before target login', async () => {
  const h = harness({ denied: true }); const response = await h.run('publish');
  assert.equal(response.status, 403); assert.deepEqual(h.calls, ['authorize']);
});
test('preview excludes credentials and never publishes', async () => {
  const h = harness(); const response = await h.run('preview'); const body = await response.text();
  assert.equal(response.status, 200); assert.ok(!body.includes('secret')); assert.ok(!body.includes('target@example.com')); assert.deepEqual(h.calls, ['authorize']);
});
test('bad target password never submits content', async () => {
  const h = harness(); const response = await h.run('publish');
  assert.equal(response.status, 401); assert.deepEqual(h.calls, ['authorize', 'login']);
});
test('profile insert uses target token and extracted tags, never staff privileges', async () => {
  const h = harness({ success: true }); const response = await h.run('publish');
  assert.equal(response.status, 200);
  const options = h.calls.find(call => Array.isArray(call))[1];
  assert.equal(options.headers.Authorization, 'Bearer target-token');
  assert.deepEqual(JSON.parse(options.body).tags, ['纽约客']);
  assert.equal(JSON.parse(options.body).user_id, 'target-user');
});
test('community publishing retains the existing moderation flow', async () => {
  const h = harness({ success: true, target: 'community' }); const response = await h.run('publish');
  assert.equal((await response.json()).pending, true);
  assert.deepEqual(h.calls, ['authorize', 'login', 'community']);
});
test('TXT has no mobile screen or public entry', () => {
  assert.equal(fs.existsSync(new URL('../app/txt-publish.tsx', import.meta.url)), false);
  assert.doesNotMatch(fs.readFileSync(new URL('../app/(tabs)/profile.tsx', import.meta.url), 'utf8'), /txt-publish|TXT 导入/);
});
