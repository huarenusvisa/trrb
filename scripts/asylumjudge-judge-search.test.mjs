import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../immigration-judge-approval-rate/judges.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../immigration-judge-approval-rate/index.html', import.meta.url), 'utf8');

// Keep the recovery behavior and its page-level accessibility contract together.
assert.match(client, /searchController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'a new judge search must cancel the previous request');
assert.match(client, /if \(!response\.ok\) throw new Error/, 'judge search must treat non-2xx responses as failures');
assert.match(client, /if \(requestId !== searchSequence\) return;/, 'stale judge results must not replace the latest search');
assert.match(client, /error\.name === 'AbortError' \|\| requestId !== searchSequence/, 'cancelled judge searches must not show an error');
assert.match(client, /id="judge-retry"[\s\S]*addEventListener\('click', \(\) => search\(query\)\)/, 'judge search errors must offer a retry for the same query');
assert.match(client, /setAttribute\('aria-busy', 'true'\)[\s\S]*setAttribute\('aria-busy', 'false'\)/, 'judge results must expose loading state');
assert.match(page, /id="result-note" role="status"/, 'judge search status must be announced');
assert.match(page, /id="results" class="results" aria-live="polite" aria-busy="false"/, 'judge results must be a polite live region');
assert.match(page, /app-i18n\.js\?v=8[\s\S]*judges\.js\?v=3/, 'judge search page must load retry translations and the recovery client');

console.log('AsylumJudge judge search recovery contract: PASS');
