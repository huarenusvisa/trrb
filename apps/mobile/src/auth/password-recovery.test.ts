import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPasswordRecovery, validateRecoveryIdentifier } from './password-recovery.ts';

test('accepts email and phone identifiers', () => {
  assert.equal(validateRecoveryIdentifier('reader@example.com'), true);
  assert.equal(validateRecoveryIdentifier('(929) 789-1391'), true);
  assert.equal(validateRecoveryIdentifier('reader'), false);
});

test('normalizes email and returns email recovery method', async () => {
  const result = await requestPasswordRecovery(' Reader@Example.com ', { fetchImpl: async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)), { action: 'request', identifier: 'reader@example.com' });
    return Response.json({ method: 'email' });
  } });
  assert.deepEqual(result, { method: 'email' });
});

test('returns support contact for phone aliases', async () => {
  const result = await requestPasswordRecovery('9297891391', { fetchImpl: async () => Response.json({ method: 'support', support_email: 'help@example.com' }) });
  assert.deepEqual(result, { method: 'support', supportEmail: 'help@example.com' });
});

test('reports request timeouts', async () => {
  await assert.rejects(requestPasswordRecovery('reader@example.com', { timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }) }), /timeout/);
});
