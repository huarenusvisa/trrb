import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { requestJson } from './lib/bounded-rest-request.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const noWait = async () => {};

test('schema cache 503 read recovers with bounded retry', async () => {
  let calls = 0;
  const retries = [];
  const result = await requestJson('https://example.test', {}, {
    fetchImpl: async () => ++calls === 1 ? json({ code: 'PGRST002', message: 'schema cache unavailable' }, 503) : json([]),
    sleep: noWait, onRetry: (info) => retries.push(info)
  });
  assert.deepEqual(result, []);
  assert.equal(calls, 2);
  assert.equal(retries[0].code, 'PGRST002');
});

test('persistent outage exits after four attempts', async () => {
  let calls = 0;
  await assert.rejects(requestJson('https://example.test', {}, {
    fetchImpl: async () => { calls++; return json({ message: 'unavailable' }, 503); }, sleep: noWait
  }), /unavailable/);
  assert.equal(calls, 4);
});

test('authentication failure is not retried', async () => {
  let calls = 0;
  await assert.rejects(requestJson('https://example.test', {}, {
    fetchImpl: async () => { calls++; return json({ message: 'unauthorized' }, 401); }, sleep: noWait
  }), /unauthorized/);
  assert.equal(calls, 1);
});

test('DELETE response loss is not replayed', async () => {
  let calls = 0;
  await assert.rejects(requestJson('https://example.test', { method: 'DELETE' }, {
    fetchImpl: async () => { calls++; throw new TypeError('connection reset'); }, sleep: noWait
  }), /connection failed/);
  assert.equal(calls, 1);
});

test('read timeout covers response body and recovers', async () => {
  let calls = 0;
  const result = await requestJson('https://example.test', {}, {
    timeoutMs: 5, sleep: noWait,
    fetchImpl: async (_url, { signal }) => {
      if (++calls > 1) return json({ ok: true });
      return { ok: true, text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) };
    }
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test('missing gate configuration pauses tasks and fails the job', () => {
  const result = spawnSync(process.execPath, ['scripts/automation-gate.mjs'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
    env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', GITHUB_OUTPUT: '' }
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /global=false/);
  assert.match(result.stdout, /ice=false/);
  assert.match(result.stderr, /::error::/);
});
