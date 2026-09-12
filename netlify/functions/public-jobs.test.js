const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'public-jobs.js'), 'utf8');

test('public jobs feed supports sanitized search and server pagination', () => {
  assert.match(source, /safeQuery\(event\.queryStringParameters\?\.q\)/);
  assert.match(source, /boundedInteger\(event\.queryStringParameters\?\.offset/);
  assert.match(source, /rpc\/search_job_listings/);
  assert.match(source, /p_category_slug: category \|\| null/);
  assert.match(source, /'Access-Control-Allow-Origin': '\*'/);
  assert.match(source, /p_keyword: keyword \|\| null/);
  assert.match(source, /p_offset: offset/);
  assert.match(source, /nextOffset: hasMore \? offset \+ items\.length : null/);
});

test('public jobs feed preserves safe listings even when no public contact action exists', () => {
  assert.match(source, /visibleRows\.map\(\(row\) => safeItem/);
  assert.doesNotMatch(source, /\.filter\(\(row\) => row\.contact\)/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
