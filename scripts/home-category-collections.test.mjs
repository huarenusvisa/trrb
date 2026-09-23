import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function homepage(rows = []) {
  const root = { innerHTML: '' };
  const events = {};
  const context = vm.createContext({
    console, Date, URL, URLSearchParams,
    document: { querySelector: selector => selector === '#sections-grid' ? root : {}, body: { appendChild() {} } },
    addEventListener: (name, fn) => { events[name] = fn; },
    TRRB_LAST_HOME_ARTICLES: rows
  });
  context.window = context;
  vm.runInContext(read('articles-home.js').replace(/loadHome\(\);\s*$/, ''), context);
  return { context, root, events };
}

const row = (id, category, extra = {}) => ({ id, title: `文章${id}`, category, category_name: category, slug: id,
  published_at: new Date().toISOString(), status: 'published', visibility: 'public', ...extra });

test('combined enforcement card includes old crime, ICE and renamed database categories', () => {
  const { context } = homepage();
  const rows = [row('crime', '美国警情'), row('ice', 'ICE执法动态'), row('legacy', '美国执法与警情'), row('new', 'ICE执法与警情'), row('topic', '美国时政', {topic_key: 'ice'})];
  const html = context.renderCategorySection('ICE执法与警情', rows);
  assert.match(html, /id="ice"/);
  assert.match(html, /href="\/iceandpolice"/);
  for (const item of rows) assert.ok(html.includes(item.title), item.category);
  assert.doesNotMatch(html, /暂无该分类内容/);
});

test('China politics renders classified database articles and direct category articles', () => {
  const { context } = homepage();
  const html = context.renderCategorySection('中国政治', [
    row('china', '中国热门头条', {editorial_topics: ['china-politics', 'xi']}),
    row('direct', '中国政治'), row('crime', '美国警情')
  ]);
  assert.match(html, /文章china/); assert.match(html, /文章direct/);
  assert.doesNotMatch(html, /文章crime|暂无该分类内容/);
  assert.match(html, /id="china-politics"/); assert.match(html, /href="\/china-politics"/);
});

test('CMS rendering deduplicates enforcement aliases and leaves Xi only in the topic area', () => {
  const { context, root, events } = homepage([row('ice', 'ICE执法动态')]);
  context.TRRB_CHANNELS = [
    {name: 'ICE执法与警情', slug: 'iceandpolice'}, {name: '美国警情', slug: 'crime'},
    {name: 'ICE', slug: 'ice'}, {name: '习近平', slug: 'xijinping'},
    {name: '中国政治', slug: 'china-politics'}
  ];
  vm.runInContext(read('topic-config.js'), context);
  assert.equal((root.innerHTML.match(/<h2>ICE执法与警情<\/h2>/g) || []).length, 1);
  assert.doesNotMatch(root.innerHTML, /<h2>ICE<\/h2>|习近平/);
  events['trrb:categories-ready']();
  assert.equal((root.innerHTML.match(/id="ice"/g) || []).length, 1);
  assert.match(read('index.html'), /href="\/xijinping"/);
});

test('production bundle contains the updated category and channel sources', () => {
  const bundle = read('homepage-topic-runtime.bundle.js');
  for (const source of ['category-runtime-v3.js', 'topic-config.js']) assert.ok(bundle.includes(read(source).trim()), source);
});
