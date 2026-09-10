const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const adminSource = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');
const recoverySource = fs.readFileSync(path.join(__dirname, 'account-recovery.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('admin shares one authenticated Supabase client with feature scripts', () => {
  assert.match(adminSource, /window\.supabaseClient\s*=\s*supabaseClient/);
  assert.match(recoverySource, /window\.supabaseClient/);
  assert.match(recoverySource, /if \(!client\?\.auth\)/);
  assert.ok(html.indexOf('./admin.js?') < html.indexOf('./account-recovery.js?'));
});
