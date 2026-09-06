import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Sample-size assertions keep approval rates tied to their decision denominator.
// Overview assertions keep loading failures recoverable without a full reload.

const client = readFileSync(new URL('../immigration-judge-approval-rate/judges.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../immigration-judge-approval-rate/index.html', import.meta.url), 'utf8');

// Keep the recovery behavior and its page-level accessibility contract together.
// Navigation assertions prevent regressions in back/forward restoration.
// Form assertions also preserve the screen-reader name and mobile search keyboard intent.
// Result-focus assertions distinguish user actions from history restoration.
// Clear-state assertions preserve native mobile controls and shareable URLs.
assert.match(client, /searchController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'a new judge search must cancel the previous request');
assert.match(client, /const REQUEST_TIMEOUT_MS = 15000/, 'judge directory requests must use a finite timeout');
assert.match(client, /controller\.abort\(new DOMException\('Request timed out', 'TimeoutError'\)\)[\s\S]*REQUEST_TIMEOUT_MS/, 'stalled judge directory requests must abort with an explicit timeout');
assert.match(client, /mode=stats', \{ signal: controller\.signal \}[\s\S]*mode=freshness', \{ signal: controller\.signal \}/, 'judge overview requests must share the timeout signal');
assert.match(client, /async function loadStats\(\)[\s\S]*catch \{[\s\S]*controller\.abort\(\)[\s\S]*finally \{[\s\S]*clearTimeout\(timeoutId\)/, 'judge overview failures must cancel sibling work and release the timeout');
assert.match(client, /if \(!response\.ok\) throw new Error/, 'judge search must treat non-2xx responses as failures');
assert.match(client, /if \(requestId !== searchSequence\) return;/, 'stale judge results must not replace the latest search');
assert.match(client, /error\.name === 'AbortError' \|\| requestId !== searchSequence/, 'cancelled judge searches must not show an error');
assert.match(client, /async function search[\s\S]*setTimeout\([\s\S]*REQUEST_TIMEOUT_MS[\s\S]*fetch\(`\/\.netlify\/functions\/immigration-judges\?q=[\s\S]*finally \{[\s\S]*clearTimeout\(timeoutId\)[\s\S]*searchController = null/, 'judge searches must bound requests, release timers, and clear the active controller');
assert.match(client, /id="judge-retry"[\s\S]*addEventListener\('click', \(\) => search\(query, \{ historyMode: 'none' \}\)\)/, 'judge search errors must offer a retry for the same query');
assert.match(client, /setAttribute\('aria-busy', 'true'\)[\s\S]*setAttribute\('aria-busy', 'false'\)/, 'judge results must expose loading state');
assert.match(client, /nextUrl === currentUrl[\s\S]*history\[mode === 'replace' \? 'replaceState' : 'pushState'\]/, 'new judge searches must create history without duplicating the current query');
assert.match(client, /addEventListener\('popstate'[\s\S]*search\(query, \{ historyMode: 'none', reveal: false \}\)/, 'browser navigation must restore the prior judge search without adding history or overriding scroll restoration');
assert.match(client, /if \(!query\)[\s\S]*resetSearch\(\)/, 'browser navigation must restore the initial empty search state');
assert.match(client, /if \(query\) url\.searchParams\.set\('q', query\);[\s\S]*else url\.searchParams\.delete\('q'\)/, 'clearing judge search must remove the query from the URL');
assert.match(client, /if \(!query\) \{[\s\S]*resetSearch\(\{ historyMode \}\)[\s\S]*return;/, 'submitting an empty judge query must restore the initial search state');
assert.match(client, /\$\('#judge-q'\)\.addEventListener\('search'[\s\S]*resetSearch\(\{ historyMode: 'push' \}\)/, 'using the native search clear control must restore the initial state and history');
assert.match(client, /row\.adjudicated_decisions \?\? row\.decision_count \?\? row\.total_asylum_decisions/, 'judge results must use the adjudicated decision sample with compatible fallbacks');
assert.match(client, /sampleSize == null \? '—' : fmt\(sampleSize\)/, 'missing sample sizes must not be displayed as zero');
assert.match(client, /mobile-sample[\s\S]*裁决样本 \$\{sampleText\}[\s\S]*<label>裁决样本<\/label><span class="verdict-sample">\$\{sampleText\}/, 'sample size must be visible in desktop and mobile judge results');
assert.match(client, /if \(!statsResponse\.ok \|\| !freshnessResponse\.ok\) throw new Error/, 'judge overview requests must reject non-success responses');
assert.match(client, /freshnessElement\.innerHTML = '[^']*数据库接口暂时无法读取[^']*freshness-retry[^']*重新尝试[^']*'[\s\S]*freshnessElement\.querySelector\('\.freshness-retry'\)\.addEventListener\('click', loadStats\)/, 'judge overview failures must offer an in-place retry');
assert.match(client, /freshnessElement\?\.setAttribute\('aria-busy', 'true'\)[\s\S]*finally[\s\S]*freshnessElement\?\.setAttribute\('aria-busy', 'false'\)/, 'judge overview must expose its loading state');
assert.match(client, /judge-retry'[\s\S]*search\(query, \{ historyMode: 'none' \}\)/, 'retrying a failed query must not add a duplicate history entry');
assert.match(client, /function revealSearchResults\(\)[\s\S]*focus\(\{ preventScroll: true \}\)[\s\S]*prefers-reduced-motion: reduce[\s\S]*scrollIntoView\(\{ behavior: reduceMotion \? 'auto' : 'smooth', block: 'start' \}\)/, 'completed judge searches must focus and reveal their status while respecting reduced motion');
assert.match(client, /if \(!rows\.length\)[\s\S]*if \(reveal\) revealSearchResults\(\)[\s\S]*return;[\s\S]*rows\.map[\s\S]*if \(reveal\) revealSearchResults\(\)/, 'both empty and populated judge results must be revealed');
assert.match(client, /查询暂不可用[\s\S]*if \(reveal\) revealSearchResults\(\)/, 'judge search errors must also be revealed');
assert.match(client, /if \(initial\)[\s\S]*reveal: false[\s\S]*addEventListener\('popstate'[\s\S]*reveal: false/, 'initial deep links and browser history restoration must preserve the current scroll position');
assert.match(page, /id="result-note" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"/, 'judge search must announce an atomic summary that remains programmatically focusable');
assert.match(page, /id="results" class="results" aria-busy="false"/, 'judge results must expose loading state');
assert.doesNotMatch(page, /id="results"[^>]*aria-live=/, 'the full judge result list must not be announced as one oversized live region');
assert.match(page, /<form id="judge-search" role="search">[\s\S]*<label class="sr-only" for="judge-q">[^<]+<\/label>[\s\S]*<input id="judge-q" name="q" type="search"/, 'judge search must expose a persistent accessible name and search landmark');
assert.match(page, /id="judge-q"[^>]*inputmode="search"[^>]*enterkeyhint="search"[^>]*aria-describedby="judge-search-help"/, 'judge search must expose mobile search keyboard intent and its visible help text');
assert.match(page, /<button type="submit">查询<\/button>/, 'judge search submit control must declare its button type');
assert.match(page, /id="data-freshness" role="status" aria-live="polite" aria-busy="true"/, 'judge overview freshness must expose an accessible status');
assert.match(page, /judges\.css\?v=4[\s\S]*app-i18n\.js\?v=8[\s\S]*judges\.js\?v=9/, 'judge search page must load overview-retry styles and the request-timeout client');
assert.match(readFileSync(new URL('../immigration-judge-approval-rate/judges.css', import.meta.url), 'utf8'), /mobile-sample\{display:none\}[\s\S]*@media\(max-width:800px\)\{\.mobile-sample\{display:inline\}\}/, 'mobile judge results must reveal the inline sample size');
assert.match(readFileSync(new URL('../immigration-judge-approval-rate/judges.css', import.meta.url), 'utf8'), /\.freshness-retry\{[^}]*text-decoration:underline[^}]*cursor:pointer/, 'judge overview retry must look interactive');

console.log('AsylumJudge judge search recovery contract: PASS');
