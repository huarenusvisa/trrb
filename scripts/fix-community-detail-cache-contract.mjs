import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const path='scripts/validate-site.mjs';
const old='requireMatch(community, /community\\.js\\?v=20260906-1/, "community PC flow cache token is stale");';
const replacement=[
  'requireMatch(community, /community\\.js\\?v=20260926-social-2-detail-1["\']/, "community PC flow cache token is stale");',
  'requireMatch(community, /social-detail\\.js\\?v=20260926-detail-1["\'][\\s\\S]*community\\.js\\?v=/, "community detail helper must load before the community client");',
  'requireMatch(community, /social-detail\\.css\\?v=20260926-detail-1["\']/, "community detail responsive styles are missing");'
].join('\n');
const source=readFileSync(path,'utf8');
if(!source.includes(replacement)){
  assert.equal(source.split(old).length,2,'Unexpected cache validation source; stop without broad replacements');
  writeFileSync(path,source.replace(old,replacement));
  const reportPath='.social-detail-integration.json';
  const report=JSON.parse(readFileSync(existsSync(reportPath)?reportPath:'scripts/social-detail-installation.json','utf8'));
  report.changed_files=[...new Set([...report.changed_files,path])];
  report.cache_contract='versioned detail dependency order and responsive stylesheet required';
  writeFileSync(reportPath,JSON.stringify(report,null,2));
}
const html=readFileSync('community/index.html','utf8');
assert.match(html,/community\.js\?v=20260926-social-2-detail-1["']/);
assert.match(html,/social-detail\.js\?v=20260926-detail-1["'][\s\S]*community\.js\?v=/);
assert.match(html,/social-detail\.css\?v=20260926-detail-1["']/);
assert.ok(readFileSync('assets/social-detail.js','utf8').includes('TrrbDetail'));
console.log('Community cache validation matches the deployed client and checks dependency order; all other build gates retained.');
