import test from 'node:test';import assert from 'node:assert/strict';import {publicArticleData,publicEvidence} from '../netlify/shared/publication.mjs';
test('public hydration omits old drafts, withdrawn source and internal research while retaining display state',()=>{
 const article={title:'更正后的标题',content:'完整新正文。',source_url:'https://x.com/whyyoutouzhele/status/123',metadata:{body_character_count:1202,unverified_public_claim:true,collection_source:{name:'李老师不是你老师'},source_attribution_correction:{original_content:'据李老师不是你老师消息。'},public_attribution_correction:{original_source_name:'李老师不是你老师'},source_text_original:'旧的截断内容',context_research:{text:'后台资料'}}};
 const result=publicArticleData(article);assert.equal(result.content,article.content);assert.equal(result.metadata.body_character_count,1202);assert.equal(result.metadata.unverified_public_claim,true);
 assert.equal(result.source_url,'');assert.doesNotMatch(JSON.stringify(result),/李老师不是你老师|截断内容|后台资料|whyyoutouzhele/);
 assert.equal(article.metadata.collection_source.name,'李老师不是你老师');assert.deepEqual(publicEvidence(article),[]);
});
test('real verified publication sources remain visible',()=>{
 const article={source_url:'https://www.cna.com.tw/news/aipl/202610020119.aspx',metadata:{source_links:['https://x.com/whyyoutouzhele/status/123']}};
 assert.equal(publicArticleData(article).source_url,article.source_url);assert.deepEqual(publicEvidence(article),[article.source_url]);
});
