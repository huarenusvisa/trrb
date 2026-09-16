import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('ordinary pageshow cannot reveal an empty hero before live content arrives',()=>{
 const timers=[],events={};const html={dataset:{}};
 const hero={textContent:'',innerHTML:'',querySelector:()=>null};
 const nodes={'#hero':hero,'#rank-list':{querySelectorAll:()=>[{}]},'#sections-grid':{children:[{}],querySelector:()=>({classList:{contains:()=>false},querySelector:()=>({})})}};
 const context={document:{documentElement:html,readyState:'complete',querySelector:s=>nodes[s],getElementById:id=>nodes['#'+id]},window:{setTimeout:(fn,ms)=>timers.push({fn,ms}),addEventListener:(name,fn)=>events[name]=fn},MutationObserver:class{observe(){}disconnect(){}},Date};
 vm.runInNewContext(read('homepage-startup-stability.js'),context);
 events.pageshow();assert.notEqual(html.dataset.homeFinalUi,'true');
 timers.find(t=>t.ms===4200).fn();assert.equal(html.dataset.homeFinalUi,'true');assert.match(hero.innerHTML,/hero-loading-note/);assert.match(hero.innerHTML,/href="\/us-politics"/);
});
test('static news fallback uses full-width no-image layout and remains crawlable',()=>{
 const source=read('scripts/inject-static-news-links.mjs');
 assert.match(source,/class="seo-static-news-item no-cover"/);assert.match(source,/seo-static-news-copy[\s\S]*href=/);
 const css=read('homepage-startup-stability.css');assert.match(css,/#top-list \.seo-static-news-item\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 const bundle=read('homepage-topic-runtime.bundle.js');assert.ok(bundle.includes(read('homepage-startup-stability.js').trim()));
});
