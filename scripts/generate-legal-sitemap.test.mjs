import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'generate-legal-sitemap.mjs');

function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'legal-sitemap-'));
  mkdirSync(path.join(root,'data/legal'),{recursive:true});
  writeFileSync(path.join(root,'data/legal/unified-legal-authorities-latest.json'),JSON.stringify({datasetVersion:'db-new',records:[{id:'case-1'}]}));
  writeFileSync(path.join(root,'data/legal/legal-ai-analysis-latest.json'),JSON.stringify({datasetVersion:'ai-old',analyses:[]}));
  writeFileSync(path.join(root,'sitemap-legal.xml'),'committed sitemap\n');
  return root;
}

test('deploy preview preserves committed legal sitemap while versions are pending',()=>{
  const cwd=fixture();
  const result=spawnSync(process.execPath,[script],{cwd,env:{...process.env,CONTEXT:'deploy-preview'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stderr,/LEGAL SITEMAP PREVIEW DEFERRED/);
  assert.equal(readFileSync(path.join(cwd,'sitemap-legal.xml'),'utf8'),'committed sitemap\n');
});

test('production remains blocked while legal database and AI versions differ',()=>{
  const cwd=fixture();
  const result=spawnSync(process.execPath,[script],{cwd,env:{...process.env,CONTEXT:'production'},encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Legal sitemap blocked/);
});
