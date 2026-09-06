import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../community/community.js', import.meta.url), 'utf8');
const productionPage = readFileSync(new URL('../asylumjudge-community.html', import.meta.url), 'utf8');
const sourcePage = readFileSync(new URL('../community/index.html', import.meta.url), 'utf8');

assert.match(client, /const REQUEST_TIMEOUT_MS = 15000/, 'community requests must use a finite timeout');
assert.match(client, /async function fetchWithTimeout[\s\S]*new AbortController\(\)[\s\S]*controller\.abort\(new DOMException\('Request timed out', 'TimeoutError'\)\)[\s\S]*REQUEST_TIMEOUT_MS/, 'stalled community requests must abort with an explicit timeout');
assert.match(client, /fetch\(url, \{ \.\.\.options, signal: controller\.signal \}\)/, 'community requests must use the timeout signal');
assert.match(client, /error\.name === 'TimeoutError'[\s\S]*请求超时，请重试。/, 'community timeouts must produce actionable localized feedback');
assert.match(client, /finally \{[\s\S]*clearTimeout\(timeoutId\)/, 'completed community requests must release their timeout');
assert.match(client, /fetchWithTimeout\(`\$\{apiUrl\}\$\{query\}`/, 'community content and mutation requests must use the bounded request helper');
assert.match(client, /fetchWithTimeout\(accountUrl/, 'community account login must use the bounded request helper');
assert.match(productionPage, /community\.js\?v=20260906-1/, 'the production community route must load the request-timeout client');
assert.match(sourcePage, /community\.js\?v=20260906-1/, 'the source community route must use the same client version');

console.log('AsylumJudge community request recovery contract: PASS');
