import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {publicArticleData} from '../netlify/shared/publication.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const names=['中国热门头条','美国时政','ICE执法与警情','中国政治','移民法官通过率','美国判例与新规','招聘求职','移民社区'];
test('all public HTML shells contain exactly the same eight primary destinations',()=>{
 for(const path of ['index.html','article.html','listing.html','immigrate/index.html']){
  const nav=read(path).split('<div class="container nav-inner">')[1].split('<form')[0];
  assert.deepEqual([...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(m=>m[1]),names,path);
 }
});
test('CMS refresh and fallback preserve products and do not move jobs to the front',()=>{
 const window={};const source=read('category-runtime-v3.js').replace('  fetchCategories().then((rows) => {','  window.getNavigation=publicNavigation; return;\n  fetchCategories().then((rows) => {');
 vm.runInNewContext(source,{window,console});
 for(const input of [[],[{slug:'hot-headlines',name:'旧名',priority:999},{slug:'community',showInNav:false},{slug:'jobs',priority:1}]]){
  const result=window.getNavigation(input);assert.deepEqual(Array.from(result,r=>r.name),names);assert.equal(result[5].href,'/legal/');assert.equal(result[6].href,'https://huarengongzuo.com/');
 }
});
test('public article serialization omits source blocks and boilerplate without erasing editorial evidence',()=>{
 const original={title:'新闻',content:'据CNBC报道，事件有新进展。',source_url:'https://example.org',source_name:'媒体',supporting_sources:[{url:'https://example.org'}],metadata:{unverified_public_claim:true,content_warning:'真实性提示',editorial_depth:'standard',source_links:['https://example.org']}};
 const published=publicArticleData(original);
 assert.equal(published.content,original.content);assert.equal(published.metadata.editorial_depth,'standard');
 assert.equal(published.source_url,undefined);assert.equal(published.source_name,undefined);assert.equal(published.supporting_sources,undefined);assert.equal(published.metadata.content_warning,undefined);
 assert.equal(original.source_url,'https://example.org');assert.equal(original.metadata.content_warning,'真实性提示');
});
