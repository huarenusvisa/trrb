import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../immigration-judge-approval-rate/judges.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../immigration-judge-approval-rate/index.html', import.meta.url), 'utf8');

// Keep the recovery behavior and its page-level accessibility contract together.
// Navigation assertions prevent regressions in back/forward restoration.
// Form assertions also preserve the screen-reader name and mobile search keyboard intent.
// Result-focus assertions distinguish user actions from history restoration.
assert.match(client, /searchController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'a new judge search must cancel the previous request');
assert.match(client, /if \(!response\.ok\) throw new Error/, 'judge search must treat non-2xx responses as failures');
assert.match(client, /if \(requestId !== searchSequence\) return;/, 'stale judge results must not replace the latest search');
assert.match(client, /error\.name === 'AbortError' \|\| requestId !== searchSequence/, 'cancelled judge searches must not show an error');
assert.match(client, /id="judge-retry"[\s\S]*addEventListener\('click', \(\) => search\(query, \{ historyMode: 'none' \}\)\)/, 'judge search errors must offer a retry for the same query');
assert.match(client, /setAttribute\('aria-busy', 'true'\)[\s\S]*setAttribute\('aria-busy', 'false'\)/, 'judge results must expose loading state');
assert.match(client, /nextUrl === currentUrl[\s\S]*history\[mode === 'replace' \? 'replaceState' : 'pushState'\]/, 'new judge searches must create history without duplicating the current query');
assert.match(client, /addEventListener\('popstate'[\s\S]*search\(query, \{ historyMode: 'none', reveal: false \}\)/, 'browser navigation must restore the prior judge search without adding history or overriding scroll restoration');
assert.match(client, /if \(!query\)[\s\S]*resetSearch\(\)/, 'browser navigation must restore the initial empty search state');
assert.match(client, /judge-retry'[\s\S]*search\(query, \{ historyMode: 'none' \}\)/, 'retrying a failed query must not add a duplicate history entry');
assert.match(client, /function revealSearchResults\(\)[\s\S]*focus\(\{ preventScroll: true \}\)[\s\S]*prefers-reduced-motion: reduce[\s\S]*scrollIntoView\(\{ behavior: reduceMotion \? 'auto' : 'smooth', block: 'start' \}\)/, 'completed judge searches must focus and reveal their status while respecting reduced motion');
assert.match(client, /if \(!rows\.length\)[\s\S]*if \(reveal\) revealSearchResults\(\)[\s\S]*return;[\s\S]*rows\.map[\s\S]*if \(reveal\) revealSearchResults\(\)/, 'both empty and populated judge results must be revealed');
assert.match(client, /查询暂不可用[\s\S]*if \(reveal\) revealSearchResults\(\)/, 'judge search errors must also be revealed');
assert.match(client, /if \(initial\)[\s\S]*reveal: false[\s\S]*addEventListener\('popstate'[\s\S]*reveal: false/, 'initial deep links and browser history restoration must preserve the current scroll position');
assert.match(page, /id="result-note" role="status" tabindex="-1"/, 'judge search status must be announced and programmatically focusable');
assert.match(page, /id="results" class="results" aria-live="polite" aria-busy="false"/, 'judge results must be a polite live region');
assert.match(page, /<form id="judge-search" role="search">[\s\S]*<label class="sr-only" for="judge-q">[^<]+<\/label>[\s\S]*<input id="judge-q" name="q" type="search"/, 'judge search must expose a persistent accessible name and search landmark');
assert.match(page, /id="judge-q"[^>]*inputmode="search"[^>]*enterkeyhint="search"[^>]*aria-describedby="judge-search-help"/, 'judge search must expose mobile search keyboard intent and its visible help text');
assert.match(page, /<button type="submit">查询<\/button>/, 'judge search submit control must declare its button type');
assert.match(page, /app-i18n\.js\?v=8[\s\S]*judges\.js\?v=5/, 'judge search page must load retry translations and the result-revealing client');

console.log('AsylumJudge judge search recovery contract: PASS');
