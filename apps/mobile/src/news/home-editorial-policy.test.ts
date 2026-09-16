import test from 'node:test';
import assert from 'node:assert/strict';
import { globalHomepageEligible, importantHomepageEligible, homepageSectionMatches } from './home-editorial-policy.ts';
const now = Date.parse('2026-09-16T20:00:00Z');
const row = {id:'1',title:'新闻',published_at:'2026-09-16T12:00:00Z',body_character_count:1500,editorial_policy_version:'body-cjk-1500-v1'};
test('important placement requires current body count, 1500 characters and ordinary publication scope',()=>{
 assert.equal(importantHomepageEligible(row,now),true);
 for (const change of [{body_character_count:1499},{editorial_policy_version:undefined},{publication_scope:'topic_only'},{published_at:'2026-09-01'},{published_at:'2026-09-17'}]) assert.equal(importantHomepageEligible({...row,...change},now),false);
 assert.equal(globalHomepageEligible({...row,body_character_count:800},now),true);
 assert.equal(globalHomepageEligible({...row,publication_scope:'topic_only'},now),false);
});
test('topic-only briefs remain available in corresponding sections and ICE is merged without losing its topic',()=>{
 assert.equal(homepageSectionMatches({...row,publication_scope:'topic_only',editorial_topics:['china-politics']},'china-politics',[]),true);
 assert.equal(homepageSectionMatches({...row,topic_key:'ice'},'us-enforcement',[]),true);
 assert.equal(homepageSectionMatches({...row,category_name:'美国警情'},'us-enforcement',['美国警情']),true);
 assert.equal(homepageSectionMatches(row,'china-politics',[]),false);
});
