import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import policy from '../netlify/functions/_shared/publisher-review-policy.js';
import standard from '../netlify/functions/_shared/news-writing-standard.js';
const content=Array.from({length:45},(_,i)=>'材料记录'+String.fromCharCode(0x4e00+i)+'项事实，说明当日活动地点与参与情况，并说明下一项公开程序。').join('\n\n');
const edited={title:'伦敦中国驻英使馆外发生抗议',summary:'当日公开报道记载活动情况。',content,editorial_depth:'standard',appears_old_news:false,editorial_review:{single_event:true,grounded:true,analysis_grounded:true,court_status_correct:true,source_chain_complete:false}};
const draft={title:'原始线索',source_name:'美国之音',source_url:'https://x.com/VOAChinese/status/123',category_name:'中国热门头条',content:'【编辑提示】未经编辑不得发布',metadata:{}};
test('pending evidence publishes edited complete report, preserving internal raw evidence',()=>{
 const raw='原帖有具体现场信息，活动有明确时间地点，但尚无第二来源。';
 const body=policy.evidencePendingArticle(draft,raw,'深度资料不足','2026-10-02T16:00:00Z',edited);
 assert.equal(body.status,'published');assert.equal(body.content,content);assert.equal(body.title,edited.title);
 assert.equal(body.metadata.source_text_original,raw);assert.equal(body.metadata.manual_review_required,true);
 assert.equal(body.metadata.editorial_depth,'standard');assert.equal(body.metadata.daily_deep_commission,false);
 assert.equal(body.metadata.publisher_authorized_release.content_sha256,createHash('sha256').update(body.title+'\n'+body.content).digest('hex'));
});
test('raw, truncated, duplicated and withdrawn-source reports cannot use pending-evidence escape',()=>{
 const raw='台湾对美军购六十六架新战机，首批两架抵达台湾。';
 assert.throws(()=>policy.evidencePendingArticle(draft,raw,'证据不足'));
 assert.throws(()=>policy.evidencePendingArticle(draft,raw,'证据不足',undefined,{...edited,content:'台湾对美军购66架F-16V(Block'}));
 assert.throws(()=>standard.assertEditedContent({...edited,content:'同一项活动出现了需要进一步处理的公开情况。'.repeat(90)}),/重复/);
 assert.throws(()=>policy.evidencePendingArticle({...draft,source_name:'李老师不是你老师'},raw,'证据不足',undefined,edited),/停用/);
 assert.throws(()=>standard.assertEditedContent({...edited,content:content+'F-16V(Block'}),/截断/);
});
test('US politics needs verified concrete US role/background even for pending publication',()=>{
 const raw='台湾对美军购六十六架新战机，首批两架抵达台湾。';
 assert.throws(()=>policy.evidencePendingArticle({...draft,category_name:'美国时政'},raw,'资料不足',undefined,edited),/美国时政/);
 const body=policy.evidencePendingArticle({...draft,category_name:'美国时政'},raw,'资料不足',undefined,{...edited,editorial_review:{...edited.editorial_review,us_context_adequate:true,us_context_evidence:'美方通报列明采购数量及软件与训练支持，正文分别归因原始文件。'}});
 assert.equal(body.status,'published');
 assert.throws(()=>standard.assertEditedContent({...edited,editorial_depth:'brief',content:'美国提供的首批战机抵达台湾，后续交付仍须协调。',editorial_review:{us_context_adequate:true,us_context_evidence:'这段简单文本不能满足完整采写的最低字数要求。'}},{usPolitics:true}),/800/);
});
test('withdrawn source is blocked in live collection and legacy queue identities',()=>{
 for(const row of [{source_username:'whyyoutouzhele'},{source_account:'@WhyYouTouZheLe'},{source_name:'李老师不是你老师'},{source_url:'https://x.com/whyyoutouzhele/status/123'}])assert.equal(standard.sourceBlocked(row),true);
 assert.equal(standard.sourceBlocked({source_username:'Focus_Taiwan',source_name:'中央社'}),false);
});
test('old news, unrelated stories and office errors remain separate from missing evidence',()=>{
 assert.equal(policy.evidenceHoldEligible('每日深度选题资料不足'),true);
 for(const reason of ['旧闻证据不足','栏目不一致资料不足','多主题材料不足','总统称谓证据错误','图片资料不足'])assert.equal(policy.evidenceHoldEligible(reason),false);
});
