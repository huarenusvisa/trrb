const assert = require('node:assert/strict');
const test = require('node:test');
const { expoJsonRequest, parseRetryAfter } = require('./expo-push-client');

const response = (status, payload = {}, retryAfter = '') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => name === 'retry-after' ? retryAfter : '' },
  json: async () => payload
});

const request = (overrides = {}) => expoJsonRequest({
  url: 'https://exp.host/example',
  body: { ids: ['ticket'] },
  headers: { accept: 'application/json' },
  operation: 'expo_test',
  sleep: async () => {},
  random: () => 0,
  ...overrides
});

test('retries 429 and 5xx with bounded exponential delays', async () => {
  const replies = [response(429, {}, '1'), response(503), response(200, { data: { ok: true } })];
  const delays = [];
  const result = await request({
    fetchImpl: async () => replies.shift(),
    sleep: async (delay) => delays.push(delay)
  });
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.payload, { data: { ok: true } });
  assert.deepEqual(delays, [1000, 1000]);
});

test('does not retry permanent 4xx responses', async () => {
  let attempts = 0;
  await assert.rejects(
    request({ fetchImpl: async () => { attempts += 1; return response(400); } }),
    (error) => error.statusCode === 422 && /expo_test_failed:400/.test(error.message)
  );
  assert.equal(attempts, 1);
});

test('does not resend after an ambiguous non-idempotent network failure', async () => {
  let attempts = 0;
  await assert.rejects(request({
    fetchImpl: async () => { attempts += 1; throw new TypeError('socket closed'); }
  }), (error) => error.statusCode === 409 && error.deliveryUnknown === true && /delivery_unknown/.test(error.message));
  assert.equal(attempts, 1);
});

test('retries a send when DNS failed before a connection was established', async () => {
  let attempts = 0;
  const result = await request({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('dns', { cause: { code: 'EAI_AGAIN' } });
      return response(200, { data: [] });
    }
  });
  assert.equal(result.attempts, 2);
});

test('retries transient network errors for idempotent receipt queries', async () => {
  let attempts = 0;
  const result = await request({
    idempotent: true,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError('temporary network failure');
      return response(200, { data: {} });
    }
  });
  assert.equal(result.attempts, 3);
});

test('parses seconds and HTTP-date Retry-After values', () => {
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter('Thu, 03 Sep 2026 12:00:03 GMT', Date.parse('Thu, 03 Sep 2026 12:00:00 GMT')), 3000);
  assert.equal(parseRetryAfter('invalid'), 0);
});
