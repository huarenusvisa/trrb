import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import articlePage from '../netlify/edge-functions/article-prerender.ts';

const require = createRequire(import.meta.url);
const { shortPath, publicPath } = require('../article-share-links.js');
const id = 'd0108575-9d56-52f9-ab30-551e6cb7e936';
const path = `/a/${id}`;
const article = {id, title:'中文标题与分享', slug:'中文标题与分享-mw3dwrxe-cf7116', publication_path:'/us-politics/%E4%B8%AD%E6%96%87-mw3dwrxe-cf7116', category_name:'美国时政', status:'published', visibility:'public', content:'已公开的新闻正文。', published_at:'2026-11-05T12:00:00Z'};
const canonical = 'https://trrb.net' + article.publication_path;
const template = '<html><head><title>News</title></head><body><article class="container article-page" id="article-root"></article></body></html>';
const context = {next:async()=>new Response('not found',{status:404})};

test('short URLs contain only ASCII and public links exclude unpublished articles', () => {
  assert.equal(shortPath(id.toUpperCase()), path);
  assert.match(shortPath(id), /^\/[a-z0-9/-]+$/);
  for(const value of ['not-an-id','../admin','https://evil.test','1','<script>']) assert.equal(shortPath(value), '');
  assert.equal(publicPath(article), path);
  for(const change of [{status:'draft'},{status:'hidden'},{visibility:'private'},{hidden_at:'2026-11-05'},{archived_at:'2026-11-05'}]) assert.equal(publicPath({...article,...change}), '');
});

function fixture(t, rows=[article]) {
  const previous=globalThis.Deno;
  globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?'https://database.test':'fixture-key'}};
  t.after(()=>{globalThis.Deno=previous;});
  let reads=0;
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);
    if(url.pathname==='/article.html') return new Response(template);
    assert.equal(url.pathname,'/rest/v1/articles');
    const q=url.searchParams;
    assert.equal(q.get('status'),'eq.published');
    assert.equal(q.get('visibility'),'eq.public');
    assert.equal(q.get('hidden_at'),'is.null');
    assert.equal(q.get('archived_at'),'is.null');
    assert.match(q.get('published_at'),/^lte\./);
    reads++;
    return Response.json(rows.filter(row=>row.status==='published'&&row.visibility==='public'&&!row.hidden_at&&!row.archived_at&&Date.parse(row.published_at)<=Date.now()&&(!q.has('id')||q.get('id')===`eq.${row.id}`)&&(!q.has('slug')||q.get('slug')===`eq.${row.slug}`)));
  });
  return ()=>reads;
}

test('short links serve readable articles without redirecting to an encoded URL, preserving canonical and card metadata',async t=>{
  const reads=fixture(t);
  const response=await articlePage(new Request('https://trrb.net'+path),context);
  const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('location'),null);
  assert.equal(response.headers.get('link'),`<${canonical}>; rel="canonical"`);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}"`));
  assert.match(html,/<h1>中文标题与分享<\/h1>/);
  assert.ok(html.includes(`data-article-id="${id}"`));
  assert.equal(reads(),1);
});

test('short link HEAD requests retain metadata with an empty body',async t=>{
  fixture(t);
  const response=await articlePage(new Request('https://trrb.net'+path,{method:'HEAD'}),context);
  assert.equal(response.status,200);
  assert.equal(await response.text(),'');
  assert.equal(response.headers.get('link'),`<${canonical}>; rel="canonical"`);
});

test('short links never reveal drafts, private, hidden, archived, scheduled or missing articles',async t=>{
  const rows=[{...article}];
  fixture(t,rows);
  for(const change of [{status:'draft'},{visibility:'private'},{hidden_at:'now'},{archived_at:'now'},{published_at:'2099-01-01T00:00:00Z'}]) {
    rows[0]={...article,...change};
    const response=await articlePage(new Request('https://trrb.net'+path),context);
    assert.equal(response.status,404);
    assert.doesNotMatch(await response.text(),/已公开的新闻正文/);
  }
  rows.length=0;
  assert.equal((await articlePage(new Request('https://trrb.net'+path),context)).status,404);
});

test('invalid short link IDs cause no database query; old noncanonical URLs retain redirects',async t=>{
  const reads=fixture(t);
  assert.equal((await articlePage(new Request('https://trrb.net/a/invalid-id'),context)).status,404);
  assert.equal(reads(),0);
  const response=await articlePage(new Request('https://trrb.net/wrong/'+encodeURIComponent(article.slug)),context);
  assert.equal(response.status,301);
  assert.equal(response.headers.get('location'),canonical);
});

test('both real admin renderers link published titles while escaping title text and leaving drafts unlinked',()=>{
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  for(const [file,name,pattern] of [
    ['admin/admin.js','renderArticleRow',/function renderArticleRow\(article\) \{[\s\S]*?\n\}/],
    ['admin/admin-publisher-v2.js','renderArticleRowWithAiState',/  function renderArticleRowWithAiState\(article\) \{[\s\S]*?\n  \}/]
  ]) {
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8').match(pattern)?.[0];
    assert.ok(source);
    const sandbox={window:{TrrbArticleLinks:{publicPath},TrrbArticlePins:{pinState:()=>({mode:'auto',active:false})}},escapeHtml:escape,escapeAttr:escape,statusLabel:x=>x,formatDate:x=>x,focusModeLabel:x=>x,article:{...article,title:'<img onerror="bad()">'}};
    vm.runInNewContext(source+`;this.result=${name}(article);`,sandbox);
    assert.ok(sandbox.result.includes(`href="${path}" target="_blank" rel="noopener"`));
    assert.ok(sandbox.result.includes('&lt;img onerror=&quot;bad()&quot;&gt;'));
    sandbox.article.status='draft';
    vm.runInNewContext(`this.result=${name}(article);`,sandbox);
    assert.doesNotMatch(sandbox.result,/admin-article-title-link/);
  }
});

test('public article UI copies the short URL and retains readable clipboard failure recovery',async()=>{
  const source=readFileSync(new URL('../article-share-links.js',import.meta.url),'utf8');
  const nodes=[];let copied='',handler,replaced;
  const meta={querySelector:()=>null,append:(...items)=>nodes.push(...items)};
  const root={dataset:{articleId:id},querySelector:()=>meta};
  const document={readyState:'complete',getElementById:()=>root,createElement:()=>({dataset:{},setAttribute(){},addEventListener:(_name,fn)=>{handler=fn;}})};
  const window={document,location:{origin:'https://trrb.net',pathname:article.publication_path,search:'',hash:''},history:{state:{page:1},replaceState:(state,_title,url)=>{replaced={state,url};}},navigator:{clipboard:{writeText:async value=>{copied=value;}}}};
  vm.runInNewContext(source,{window});
  assert.equal(replaced.url,path);
  assert.equal(replaced.state.page,1);
  await handler();
  assert.equal(copied,'https://trrb.net'+path);
  assert.equal(nodes.at(-1).textContent,'链接已复制');
  window.navigator.clipboard.writeText=async()=>{throw new Error('denied');};
  await handler();
  assert.equal(nodes.at(-1).textContent,'复制失败，请复制地址栏链接');
  assert.equal(nodes.at(-2).disabled,false);
});
