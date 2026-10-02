import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {qualifyTweet,tweetFromCandidate,assertPublicationQuality} from './china-hot-li-teacher-ingest.mjs';
test('withdrawn source cannot return through legacy candidates or collection',()=>{
 const tweet=tweetFromCandidate({external_id:'x:whyyoutouzhele:123',source_name:'李老师不是你老师',source_url:'https://x.com/whyyoutouzhele/status/123',raw_text:'台湾向美国采购的战机交付，双方开始接装与换训。',collected_at:new Date().toISOString()});
 assert.equal(qualifyTweet(tweet).accepted,false);
 const script=readFileSync(new URL('./china-hot-li-teacher-ingest.mjs',import.meta.url),'utf8');
 const collect=script.slice(script.indexOf('function collectXPosts()'),script.indexOf('export function sourceFor'));
 assert.doesNotMatch(collect,/await collectLiTeacherPosts/);
 assert.match(script,/const body=await buildEvidencePendingArticle/);
 const daily=readFileSync(new URL('./news-daily-depth.mjs',import.meta.url),'utf8');assert.match(daily,/const body=await buildEvidencePendingArticle/);
});
test('normal publication also rejects truncated US briefs',()=>{
 assert.throws(()=>assertPublicationQuality({media:[]},{title:'台湾首批美制战机交付',content:'美国对台军购66架F-16V(Block',editorial_depth:'brief',publication_scope:'topic_only'}),/800/);
});
