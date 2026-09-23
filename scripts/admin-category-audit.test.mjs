import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { articleCategoryLabel } = require('../netlify/functions/_shared/article-search.js');
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('admin article labels match collections and preserve crime subtypes', () => {
  for (const category_name of ['ICE', 'ICE执法动态', '美国执法与警情']) {
    assert.equal(articleCategoryLabel({category_name}), 'ICE执法与警情');
  }
  assert.equal(articleCategoryLabel({category_name: '美国警情'}), 'ICE执法与警情 · 美国警情');
  assert.equal(articleCategoryLabel({category_name: '热门头条'}), '中国热门头条');
  assert.equal(articleCategoryLabel({category_name: '热门头条', metadata: {editorial_topics: ['china-politics']}}), '中国热门头条 · 中国政治');
});

test('standard category action no longer recreates obsolete English categories or Xi homepage cards', () => {
  const source = read('admin/category-manager.js');
  const context = {window: {}, document: {addEventListener() {}}};
  vm.runInNewContext(source.replace('  document.addEventListener(', '  window.standardCategories = STANDARD_CATEGORIES;\n  document.addEventListener('), context);
  const categories = context.window.standardCategories;
  assert.equal(categories.find(c => c.slug === 'iceandpolice').name, 'ICE执法与警情');
  assert.equal(categories.find(c => c.slug === 'china-politics').name, '中国政治');
  assert.equal(categories.find(c => c.slug === 'xijinping').show_on_homepage, false);
  assert.equal(categories.find(c => c.slug === 'xijinping').show_in_navigation, false);
  assert.ok(!categories.some(c => ['ice','politics','china','uscis','visa','dhs','cbp','world'].includes(c.slug)));
  assert.doesNotMatch(source, /\.update\(standard\)/);
});
