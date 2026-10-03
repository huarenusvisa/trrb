import { setTimeout as delay } from 'node:timers/promises';

// Retry reads only. A timed-out mutation may already have committed.
export async function requestJson(url, options = {}, {
  fetchImpl = fetch, sleep = delay, timeoutMs = 15000, attempts = 4,
  onRetry = () => {}
} = {}) {
  const readOnly = ['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase());
  const maximum = readOnly ? attempts : 1;
  for (let attempt = 1; attempt <= maximum; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let failure;
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      if (response.ok) return body;
      failure = new Error(body?.message || body?.details || body?.error || `HTTP ${response.status}`);
      failure.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      failure.status = response.status;
      failure.code = body?.code;
    } catch (error) {
      failure = new Error(controller.signal.aborted ? 'Database API request timed out' : 'Database API connection failed', { cause: error });
      failure.retryable = true;
    } finally {
      clearTimeout(timer);
    }
    if (!failure.retryable || attempt === maximum) throw failure;
    onRetry({ attempt, maximum, status: failure.status, code: failure.code });
    await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
  }
}
