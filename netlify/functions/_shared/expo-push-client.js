const PREFLIGHT_NETWORK_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED']);

class ExpoRequestError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ExpoRequestError';
    this.status = options.status || 0;
    this.retryable = Boolean(options.retryable);
    this.deliveryUnknown = Boolean(options.deliveryUnknown);
    this.retryAfterMs = options.retryAfterMs || 0;
    this.statusCode = this.deliveryUnknown
      ? 409
      : (this.status >= 400 && this.status <= 499 && this.status !== 429 ? 422 : 503);
  }
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

function networkCode(error) {
  return String(error?.cause?.code || error?.code || '').toUpperCase();
}

function retryDelay(error, attempt, { baseDelayMs, maxDelayMs, random }) {
  if (error.retryAfterMs) return Math.min(error.retryAfterMs, maxDelayMs);
  const exponential = baseDelayMs * (2 ** (attempt - 1));
  const jitter = Math.floor(exponential * 0.25 * random());
  return Math.min(exponential + jitter, maxDelayMs);
}

async function expoJsonRequest({
  url,
  body,
  headers,
  operation,
  idempotent = false,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  maxAttempts = 3,
  baseDelayMs = 500,
  maxDelayMs = 4000
}) {
  if (typeof fetchImpl !== 'function') throw new Error('expo_fetch_unavailable');
  const label = operation || 'expo_request';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    } catch (cause) {
      const preflightFailure = PREFLIGHT_NETWORK_CODES.has(networkCode(cause));
      const error = new ExpoRequestError(
        preflightFailure || idempotent ? `${label}_network_failed` : `${label}_delivery_unknown`,
        { cause, retryable: preflightFailure || idempotent, deliveryUnknown: !preflightFailure && !idempotent }
      );
      if (!error.retryable || attempt === maxAttempts) throw error;
      await sleep(retryDelay(error, attempt, { baseDelayMs, maxDelayMs, random }));
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (response.ok) return { payload, attempts: attempt };

    const status = Number(response.status) || 0;
    const retryable = status === 429 || (status >= 500 && status <= 599);
    const error = new ExpoRequestError(`${label}_failed:${status}`, {
      status,
      retryable,
      retryAfterMs: parseRetryAfter(response.headers?.get?.('retry-after'))
    });
    if (!retryable || attempt === maxAttempts) throw error;
    await sleep(retryDelay(error, attempt, { baseDelayMs, maxDelayMs, random }));
  }

  throw new ExpoRequestError(`${label}_failed`, { retryable: false });
}

module.exports = { ExpoRequestError, expoJsonRequest, parseRetryAfter };
