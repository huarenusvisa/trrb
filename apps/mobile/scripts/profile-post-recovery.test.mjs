import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/profile-post/[id].tsx', import.meta.url),'utf8');
const loadSource = source.slice(source.indexOf('  const load = useCallback'),source.indexOf('  const save = async'));
function harness(post, comments) {
  const shown = [], errors = [];
  const context = {Promise,Error,request:{current:0},postId:'post-1',loadError:'',commentError:'',editing:false,t:k=>k,useCallback:fn=>fn,useEffect:()=>{},useForegroundRetry:()=>{},withUiTimeout:p=>p,
    supabase:{auth:{getUser:async()=>({data:{user:null}})}}, getProfilePost:()=>post,listProfilePostComments:()=>comments,
    setPost:v=>shown.push(v),setLoadError:v=>errors.push(v),setCommentError:v=>errors.push(v),setLoading:()=>{},setMe:()=>{},setCaption:()=>{},setTagsText:()=>{},setComments:()=>{}};
  vm.createContext(context); vm.runInContext(loadSource+'\nthis.load=load;',context);
  return {shown,errors,load:context.load};
}
test('failed comments keep the article and its full text on screen',async()=>{
 const article={id:'post-1',caption:'全文正文'.repeat(100),tags:[]};
 const h=harness(Promise.resolve(article),Promise.reject(new Error('comments offline')));
 await h.load();assert.equal(h.shown[0],article);assert.ok(h.errors.includes('comments offline'));
});
test('failed article can be retried without navigating out of personal center',async()=>{
 const h=harness(Promise.reject(new Error('article timeout')),Promise.resolve([])); await h.load();assert.equal(h.shown.length,0);assert.ok(h.errors.includes('article timeout'));
 const loadBody=loadSource.slice(0,loadSource.indexOf('  useEffect'));
 assert.doesNotMatch(loadBody,/router\.back/);
});
test('one failed media signature cannot hide other personal center article cards',async()=>{
 const posts=fs.readFileSync(new URL('../src/social/posts.ts',import.meta.url),'utf8');
 const fn=posts.slice(posts.indexOf('async function withSignedUrls'),posts.indexOf('export async function getProfilePost'));
 const context={signedPostMediaUrl:async path=>{if(path==='broken')throw Error('sign failed');return 'https://media.test/'+path;}};
 vm.createContext(context);vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nthis.sign=withSignedUrls;',context);
 const rows=await context.sign([{id:'one',caption:'全文',profile_post_media:[{storage_path:'broken',sort_order:0}]},{id:'two',profile_post_media:[{storage_path:'good',sort_order:0}]}]);
 assert.equal(rows.length,2);assert.equal(rows[0].caption,'全文');assert.equal(rows[0].profile_post_media[0].signed_url,undefined);assert.equal(rows[1].profile_post_media[0].signed_url,'https://media.test/good');
});
