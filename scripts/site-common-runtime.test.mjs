import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('shared script completes boot and installs image handling and navigation startup', () => {
  const appended = [];
  const listeners = [];
  class Image {}
  const document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: tag => ({ tag, dataset: {} }),
    head: { appendChild: element => appended.push(element) },
    addEventListener: (type, handler) => listeners.push({ type, handler })
  };
  const window = {};
  vm.runInNewContext(readFileSync(new URL('../site-common.js', import.meta.url), 'utf8'), {
    window, document, HTMLImageElement: Image, console
  });
  assert.equal(typeof window.TRRB_applyImageFallback, 'function');
  assert.equal(window.__TRRB_IMAGE_FALLBACK_INSTALLED__, true);
  assert.ok(appended.some(element => element.src?.startsWith('/article-route-runtime.js')));
  assert.ok(listeners.some(listener => listener.type === 'DOMContentLoaded'));
  const img = new Image();
  img.dataset = {};
  img.removeAttribute = () => {};
  img.style = { setProperty: () => {} };
  img.closest = () => null;
  assert.equal(window.TRRB_applyImageFallback(img), true);
  assert.equal(img.hidden, true);
});

test('route runtime recognizes both names of the China headlines category', () => {
  const window = {};
  const document = { readyState: 'loading', addEventListener() {} };
  vm.runInNewContext(readFileSync(new URL('../article-route-runtime.js', import.meta.url), 'utf8'), {
    window, document, console
  });
  for (const category_name of ['热门头条', '中国热门头条']) {
    assert.equal(window.TRRB_articleUrl({ id: 'sample', slug: 'school-report', category_name }), '/hot-headlines/school-report');
  }
  assert.equal(window.TRRB_articleUrl({ slug: 'ice-report', category_name: '中国热门头条', topic_key: 'ice' }), '/ice/ice-report');
});
