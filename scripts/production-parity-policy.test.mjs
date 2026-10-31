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
