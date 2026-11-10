import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import template from '../netlify/shared/article-template.mjs';

test('bundled template exactly matches the deploy source and retains client assets',()=>{
  assert.equal(template,readFileSync(new URL('../article.html',import.meta.url),'utf8'));
  assert.match(template,/id="article-root"/);
  assert.match(template,/<script/);
  assert.match(readFileSync(new URL('../netlify.toml',import.meta.url),'utf8'),/node scripts\/bundle-article-template\.mjs &&/);
});
