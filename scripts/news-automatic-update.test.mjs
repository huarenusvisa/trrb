import test from 'node:test';
import assert from 'node:assert/strict';
import {automationMayUpdate,articleUpdateBody} from './news-article-updates.mjs';
import {contentDigest} from './news-editorial-policy.mjs';
import {iceDepthCandidate} from './news-daily-depth.mjs';
test('reviewed automatic ICE reports can expand at the same URL while human edits remain protected',()=>{
 const prior={id:'same-id',slug:'same-url',title:'纽约ICE执法进展',content:'原文',status:'published',visibility:'public',review_status:'reviewed_source_auto_published',published_at:'2026-10-03T12:00:00Z',metadata:{reviewed_content_sha256:contentDigest('纽约ICE执法进展','原文')}};
 assert.equal(automationMayUpdate(prior),true);
 for(const flag of ['manual_override','manual_content_review','reviewed_at','editor_locked'])assert.equal(automationMayUpdate({...prior,metadata:{...prior.metadata,[flag]:true}}),false);
 assert.equal(automationMayUpdate({...prior,content:'人工编辑后正文'}),false);
 const update=articleUpdateBody(prior,{title:prior.title,content:'补采后的完整稿件',metadata:{}},'补采确认事实');
 for(const key of ['id','slug','published_at','category_id'])assert.equal(Object.hasOwn(update,key),false);
});
test('ICE depth candidates use original posts and exclude manually edited stories',()=>{
 const story={id:'story',article_id:'article',ai_payload:{},human_review_status:'not_required_reviewed'},post={x_post_id:'post',source_text:'Original ICE arrest announcement',x_url:'https://x.com/ICEgov/status/123',source_created_at:new Date().toISOString(),source_username:'ICEgov'};
 assert.equal(iceDepthCandidate(story,post).raw_text,post.source_text);
 assert.equal(iceDepthCandidate({...story,reviewed_by:'human'},post),null);
 assert.equal(iceDepthCandidate({...story,ai_payload:{manual_override:true}},post),null);
});
