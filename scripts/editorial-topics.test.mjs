import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {editorialTopics, politicalSections} from '../netlify/shared/editorial-topics.mjs';
import collection from '../netlify/edge-functions/xi-topic.ts';
const context = {next: async () => new Response('pass')};

test('political topics add membership without moving or duplicating article identity', () => {
  const row = {id:'a',slug:'old-slug',category_name:'中国热门头条',title:'习近平会见代表团'};
  const before = JSON.stringify(row);
  assert.deepEqual(editorialTopics(row), ['china-politics','xi']);
  assert.deepEqual(politicalSections(row), ['中国热门头条','中国政治','习近平专题']);
  assert.deepEqual(editorialTopics({title:'胖东来员工工资调整'}), []);
  assert.deepEqual(editorialTopics({title:'省委书记履新'}), ['china-politics']);
  assert.deepEqual(editorialTopics({title:'李强会见来访代表团'}), ['china-politics']);
  assert.equal(JSON.stringify(row), before);
});
test('homepage combines enforcement, separates politics, and preserves original article links', () => {
  const source = fs.readFileSync(new URL('../articles-home.js', import.meta.url),'utf8').replace(/loadHome\(\);\s*$/, '');
  const sandbox = {window:{}, Date, URLSearchParams, console};
  vm.runInNewContext(source, sandbox);
  const now = new Date().toISOString();
  const rows = [
    {id:'p',slug:'party',title:'省委书记履新',category:'热门头条',editorial_topics:['china-politics']},
    {id:'c',slug:'case',title:'纽约警方案件进展',category:'美国警情'},
    {id:'i',slug:'detention',title:'ICE拘留案件',category:'ICE执法动态',topic_key:'ice'}
  ].map(row => ({...row,published_at:now}));
  const politics = sandbox.window.renderCategorySection('美国警情', rows);
  assert.match(politics, /中国政治/);
  assert.match(politics, /href="\/hot-headlines\/party"/);
  assert.doesNotMatch(politics, /纽约警方案件|ICE拘留案件/);
  const enforcement = sandbox.window.renderCategorySection('ICE执法动态', rows);
  assert.match(enforcement, /美国执法与警情/);
  assert.match(enforcement, /href="\/us-crime\/case"/);
  assert.match(enforcement, /href="\/ice\/detention"/);
  assert.doesNotMatch(enforcement, /省委书记履新/);
});
test('collection filters retain privacy constraints, canonical pagination and original URLs', async t => {
  const previous = globalThis.Netlify;
  globalThis.Netlify = {env:{get:key=>key==='SUPABASE_URL'?'https://data.test':'test-key'}};
  t.after(()=>{globalThis.Netlify=previous;});
  let fetched;
  t.mock.method(globalThis,'fetch',async input=>{
    fetched = new URL(input);
    assert.equal(fetched.searchParams.get('status'),'eq.published');
    assert.equal(fetched.searchParams.get('visibility'),'eq.public');
    return Response.json([{id:'x',slug:'existing',title:'省委书记任免',category_name:'中国热门头条',published_at:'2026-09-15'}]);
  });
  let response = await collection(new Request('https://trrb.net/china-politics?view=appointments&page=2'),context);
  let html = await response.text();
  assert.equal(response.status,200);
  assert.match(fetched.searchParams.get('or'),/省委书记/);
  assert.match(fetched.searchParams.get('and'),/^\(or\(.*任命.*\)\)$/);
  assert.equal(fetched.searchParams.get('offset'),'20');
  assert.match(html,/rel="canonical" href="https:\/\/trrb.net\/china-politics\?view=appointments&amp;page=2"/);
  assert.match(html,/href="\/hot-headlines\/existing"/);
  await collection(new Request('https://trrb.net/us-enforcement?view=crime'),context);
  assert.equal(fetched.searchParams.get('category_name'),'eq.美国警情');
  await collection(new Request('https://trrb.net/us-enforcement?view=ice'),context);
  assert.doesNotMatch(fetched.searchParams.get('or'),/美国警情/);
  response = await collection(new Request('https://trrb.net/us-enforcement?view=bad'),context);
  assert.equal(response.status,404);
});
