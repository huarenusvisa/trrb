import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qualifyTweet,tweetFromCandidate,assertPublicationQuality,collectLiTeacherPosts} from './china-hot-li-teacher-ingest.mjs';
import standard from '../netlify/functions/_shared/news-writing-standard.js';
import {publicAttributionText} from './news-attributed-report-policy.mjs';

test('publisher-restored account is eligible through live and stored source identities',()=>{
 for(const source of [{source_username:'whyyoutouzhele'},{source_account:'@WhyYouTouZheLe'},{source_name:'李老师不是你老师'},{source_url:'https://x.com/whyyoutouzhele/status/123'}]) assert.equal(standard.sourceBlocked(source),false);
 const tweet=tweetFromCandidate({external_id:'x:whyyoutouzhele:123',source_name:'李老师不是你老师',source_url:'https://x.com/whyyoutouzhele/status/123',raw_text:'台湾向美国采购的战机交付，双方开始接装与换训。',collected_at:new Date().toISOString()});
 assert.equal(qualifyTweet(tweet).accepted,true);
 const script=readFileSync(new URL('./china-hot-li-teacher-ingest.mjs',import.meta.url),'utf8');
 const collect=script.slice(script.indexOf('function collectXPosts()'),script.indexOf('export function sourceFor'));
 assert.match(collect,/await collectLiTeacherPosts\(\)/);
});

test('restored collector queries the account within twelve hours and retains original images',async t=>{
 const date=new Date(Date.now()-60000).toISOString(); let calls=0;
 t.mock.method(globalThis,'fetch',async value=>{
  calls++; const url=new URL(value);
  assert.equal(url.hostname,'api.x.com');
  assert.equal(url.searchParams.get('query'),'from:whyyoutouzhele -is:retweet -is:reply');
  const age=Date.now()-Date.parse(url.searchParams.get('start_time'));
  assert.ok(age>0 && age<=12*3600000+5000);
  const item={id:'2119999999999999999',text:'重庆学校公布调整开学安排，教育部门将继续评估高温情况。',created_at:date,attachments:{media_keys:['photo']}};
  return Response.json({data:[item,item],includes:{media:[{media_key:'photo',type:'photo',url:'https://pbs.twimg.com/media/school.jpg',width:1200,height:800}]}});
 });
 const posts=await collectLiTeacherPosts();
 assert.equal(calls,1);assert.equal(posts.length,1);
 assert.equal(posts[0].source_username,'whyyoutouzhele');assert.equal(posts[0].created_at,date);
 assert.equal(posts[0].media[0].url,'https://pbs.twimg.com/media/school.jpg');
 assert.equal(qualifyTweet(posts[0]).accepted,true);
 const raw='据X账号“李老师不是你老师”发布的消息，重庆学校被指调整开学安排。https://x.com/whyyoutouzhele/status/123';
 const visible=publicAttributionText(raw);assert.doesNotMatch(visible,/李老师|whyyoutouzhele|X账号|https:\/\//);
 assert.match(visible,/被指/);
});

test('normal publication still rejects truncated US briefs',()=>{
 assert.throws(()=>assertPublicationQuality({media:[]},{title:'台湾首批美制战机交付',content:'美国对台军购66架F-16V(Block',editorial_depth:'brief',publication_scope:'topic_only'}),/800/);
});
