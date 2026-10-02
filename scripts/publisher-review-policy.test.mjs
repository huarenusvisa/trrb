import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import policy from '../netlify/functions/_shared/publisher-review-policy.js';
test('insufficient evidence publishes an attributed source report with a later review queue',()=>{
 const draft={title:'伦敦中国驻英使馆外发生抗议',source_name:'美国之音',source_url:'https://x.com/VOAChinese/status/123',content:'【编辑提示】未经编辑不得发布',metadata:{manual_review_required:true,publication_blocked_until_edited:true,editorial_depth:'deep'}};
 const raw='10月1日示威者在中国驻英国使馆外举行抗议，呼吁关注中国人权。';
 const body=policy.evidencePendingArticle(draft,raw,'深度资料不足','2026-10-02T16:00:00Z');
 assert.equal(body.status,'published');assert.equal(body.visibility,'public');assert.match(body.content,/据美国之音/);assert.ok(body.content.includes(raw));assert.ok(!body.content.includes('【编辑提示】'));
 assert.equal(body.metadata.manual_review_required,true);assert.equal(body.metadata.post_publication_review_status,'pending');assert.equal(body.metadata.publication_blocked_until_edited,false);assert.equal(body.metadata.editorial_depth,'brief');assert.equal(body.metadata.daily_deep_commission,false);
 assert.equal(body.metadata.publisher_authorized_release.content_sha256,createHash('sha256').update(body.title+'\n'+body.content).digest('hex'));
});
test('evidence release is distinct from old news, wrong offices, unrelated stories and missing sources',()=>{
 assert.equal(policy.evidenceHoldEligible('每日深度选题资料不足'),true);
 for(const text of ['旧闻证据不足','栏目不一致资料不足','多主题材料不足','总统称谓证据错误','图片资料不足'])assert.equal(policy.evidenceHoldEligible(text),false);
 assert.throws(()=>policy.evidencePendingArticle({source_url:''},'这是有二十个字以上的具体原始新闻材料用于测试','资料不足'));
});
