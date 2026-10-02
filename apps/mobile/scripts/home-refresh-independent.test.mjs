import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const loadSource = source.slice(source.indexOf('  async function load(restoreCache'), source.indexOf('  async function loadWeather()'));
function deferred() { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; }
function harness(focus) {
  const writes = [], shown = [];
  const context = {setTimeout, clearTimeout, loadSequence:{current:0}, focusArticles:[{id:'old-focus'}], articles:[],
    fetchHomepageBundle:async()=>[{id:'new-headline'}],fetchHomepageFocus:()=>focus.promise,
    readCachedHomeFeedEnvelope:async()=>null,cacheHomeFeed:async(global,focus)=>{writes.push({global,focus});},
    AccessibilityInfo:{announceForAccessibility(){}},t:x=>x};
  for(const name of ['SlowLoading','FocusArticles','CacheSavedAt','Loading','Refreshing','Error']) context['set'+name]=()=>{};
  context.setArticles=rows=>shown.push(rows);
  vm.createContext(context); vm.runInContext(loadSource+'\nthis.load=load;',context);
  return {context,writes,shown};
}
test('fresh headlines render and cache before a slow focus request finishes',async()=>{
  const focus=deferred(),h=harness(focus); await h.context.load();
  assert.equal(h.shown[0][0].id,'new-headline');assert.equal(h.writes.length,1);
  focus.resolve([{id:'fresh-focus'}]);await new Promise(r=>setImmediate(r));
  assert.equal(h.writes.at(-1).focus[0].id,'fresh-focus');
});
test('late focus response from an older refresh cannot overwrite current news',async()=>{
  const focus=deferred(),h=harness(focus);await h.context.load();h.context.loadSequence.current++;
  focus.resolve([{id:'stale-focus'}]);await new Promise(r=>setImmediate(r));assert.equal(h.writes.length,1);
});
test('old cache restoration cannot overwrite a newer successful refresh',async()=>{
  const focus=deferred(),cache=deferred(),h=harness(focus);
  h.context.readCachedHomeFeedEnvelope=()=>cache.promise;
  const initial=h.context.load(true);await h.context.load();
  cache.resolve({snapshot:{articles:[{id:'old-headline'}],focusArticles:[]},savedAt:1});await initial;
  assert.equal(h.shown.length,1);assert.equal(h.shown[0][0].id,'new-headline');
  focus.resolve([]);
});
