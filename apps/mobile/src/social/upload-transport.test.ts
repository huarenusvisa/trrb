import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadJsonWithProgress } from './upload-transport.ts';
function harness(signal?: AbortSignal) {
 const progress:number[] = [], headers:Record<string,string> = {};
 const xhr = { upload: {} as any, open() {}, setRequestHeader(k:string,v:string){headers[k]=v;}, send() {}, abort() { this.onabort?.(); }, status:200,responseText:'{"path":"conversation/user/file"}',onabort:null as any,onload:null as any,onerror:null as any,ontimeout:null as any };
 const promise=uploadJsonWithProgress({url:'https://example.test/upload',token:'user-jwt',apiKey:'public-key',body:{action:'upload'},onProgress:value=>progress.push(value),signal},()=>xhr as any);
 return {xhr,promise,progress,headers};
}
test('authenticated upload reports byte progress and only acknowledges completion after response',async()=>{
 const h=harness(); h.xhr.upload.onprogress({lengthComputable:true,loaded:100,total:100}); assert.deepEqual(h.progress,[0,95]);
 h.xhr.onload(); assert.equal((await h.promise).path,'conversation/user/file');assert.equal(h.progress.at(-1),100);
 assert.equal(h.headers.Authorization,'Bearer user-jwt');assert.equal(h.headers.apikey,'public-key');
});
test('server failures never report complete',async()=>{ const h=harness();h.xhr.status=403;h.xhr.onload();await assert.rejects(h.promise);assert.ok(!h.progress.includes(100)); });
test('invalid success response is rejected',async()=>{const h=harness();h.xhr.responseText='{}';h.xhr.onload();await assert.rejects(h.promise);});
test('timeout surfaces an error and late response cannot turn failure into success',async()=>{const h=harness();h.xhr.ontimeout();await assert.rejects(h.promise);h.xhr.onload();assert.ok(!h.progress.includes(100));});
test('leaving chat aborts an ongoing upload',async()=>{const controller=new AbortController(),h=harness(controller.signal);controller.abort();await assert.rejects(h.promise);});
