import test from 'node:test';
import assert from 'node:assert/strict';
import {hasMaterialUpdate,findDuplicateStory} from './ice-fast-intake.mjs';
import {sourceFingerprint,editorialRetryAllowed} from './news-priority.mjs';
import {EDITORIAL_POLICY_VERSION} from './news-editorial-policy.mjs';
import {sameCoveredIncident} from './news-covered-incidents.mjs';
const original={title:'普林斯顿博士生谢怡被ICE拘留',content:'Eva Yi Xie was detained by ICE at an airport.',ai_payload:{}};
test('biography, counts, bylines and locations do not reopen an arrest',()=>{
  for(const source_text of ['Eva Yi Xie is a 24 year old Princeton student, professor Carlos Brody supports her.',
    'Update: ICE confirmed Eva Yi Xie was detained. 211 people signed a letter in New York.',
    'Supporters request release of Eva Yi Xie.'])
    assert.equal(hasMaterialUpdate({source_text,city:'New York'},original),false);
  assert.equal(hasMaterialUpdate({source_text:'Eva Yi Xie was released from detention.'},original),true);
  assert.equal(hasMaterialUpdate({source_text:'Eva Yi Xie may be released tomorrow.'},original),false);
});
test('cross-language reposts match the covered incident but distinct people and dates do not',()=>{
  const post={source_text:'Princeton student Eva Yi Xie detained by ICE; supporters comment.'};
  assert.equal(sameCoveredIncident(post,original),true);
  assert.equal(findDuplicateStory(post,[original]),original);
  assert.equal(sameCoveredIncident({...post,event_date:'2027-02-10'},original),false);
  assert.equal(sameCoveredIncident({source_text:'Another Princeton student detained by ICE'},original),false);
  assert.equal(sameCoveredIncident({source_text:'ICE arrested passengers on Alaska Airlines flight 1306 at Seattle airport'},
    {title:'西雅图机场阿拉斯加航空ICE拘捕旅客'}),true);
});
test('repost transport IDs, times, URLs and duplicate evidence cannot reset the two-attempt limit',()=>{
  const a={source_text:'ICE detained a student. https://x.com/a/status/1',x_post_id:'1',source_created_at:'2026-11-23T10:00:00Z'};
  const b={...a,source_text:'ICE detained a student. https://x.com/b/status/2',x_post_id:'2',source_created_at:'2026-11-23T11:00:00Z'};
  assert.equal(sourceFingerprint([a]),sourceFingerprint([b,b]));
  const story={ai_payload:{editorial_attempt:{policy_version:EDITORIAL_POLICY_VERSION,fingerprint:sourceFingerprint([a]),count:2,at:'2026-11-23T10:00:00Z'}}};
  assert.equal(editorialRetryAllowed(story,[b],Date.parse('2026-11-23T12:00:00Z')),false);
});
