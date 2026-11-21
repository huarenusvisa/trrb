import test from 'node:test';
import assert from 'node:assert/strict';
import {isWorkflowOnlyDifference} from './production-parity-policy.mjs';
const compare = (files) => ({status:'ahead',merge_base_commit:{sha:'live'},files:files.map(filename=>({filename}))});
test('recovery workflow alone does not require a website deployment',()=>{
  assert.equal(isWorkflowOnlyDifference(compare(['.github/workflows/china-hot-recovery-wakeup.yml']),'live'),true);
});
test('website changes and deployment configuration still alert',()=>{
  for(const path of ['index.html','netlify/shared/editorial-topics.mjs','netlify/functions/news.js','scripts/build.mjs','.github/workflows/round16-node9-production-deploy-recovery.yml','.github/workflows/seo-search-engine-ops.yml'])
    assert.equal(isWorkflowOnlyDifference(compare(['.github/workflows/china-hot-recovery-wakeup.yml',path]),'live'),false,path);
});
test('renames, divergence, missing or potentially truncated evidence cannot silence an alert',()=>{
  const renamed=compare(['.github/workflows/old.yml']);renamed.files[0].previous_filename='index.html';
  for(const data of [renamed, {...compare(['.github/workflows/a.yml']),status:'diverged'},compare([]),compare(Array(300).fill('.github/workflows/a.yml')),{}])
    assert.equal(isWorkflowOnlyDifference(data,'live'),false);
  assert.equal(isWorkflowOnlyDifference(compare(['.github/workflows/a.yml']),'other'),false);
});

const audit='round16-node3-ai-incremental-grounding-audit.json';
const timestampAudit={
  filename:audit,status:'modified',additions:1,deletions:1,changes:2,
  patch:'@@ -1,5 +1,5 @@\\n {\\n-  "generatedAt": "2026-11-21T13:51:11.567Z",\\n+  "generatedAt": "2026-11-21T13:53:51.695Z",\\n   "node": "3"'
};
test('known audit generatedAt refresh plus workflow change does not require deployment',()=>{
  const data=compare(['.github/workflows/round16-node3-ai-incremental-grounding.yml',audit]);
  data.files[1]=timestampAudit;
  assert.equal(isWorkflowOnlyDifference(data,'live'),true);
});
test('audit edits affecting substance, unknown reports and missing patch remain alerts',()=>{
  const data=compare(['.github/workflows/a.yml',audit]);
  for (const change of [
    {...timestampAudit,patch:'@@ -1 +1 @@\\n-  "count": 717,\\n+  "count": 718,'},
    {...timestampAudit,patch:'@@ -1 +1 @@\\n-  "generatedAt": "2026-11-21T13:51:11.567Z",\\n+  "generatedAt": "2026-11-21T13:53:51.695Z",\\n+  "count": 718,'},
    {...timestampAudit,patch:undefined},
    {...timestampAudit,changes:4},
    {...timestampAudit,previous_filename:'other.json'},
    {...timestampAudit,filename:'other-audit.json'}
  ]) { data.files[1]=change; assert.equal(isWorkflowOnlyDifference(data,'live'),false,JSON.stringify(change)); }
});
