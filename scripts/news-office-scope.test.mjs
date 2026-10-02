import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../netlify/functions/_shared/news-editorial-policy.js';
import scope from '../netlify/functions/_shared/news-collection-scope.js';
import routing from '../netlify/functions/_shared/official-content-routing.js';
test('current titles blocked in title, summary and body; historical dates and 此前 preserved',()=>{
  for(const field of ['title','summary','content','seo_title']) for(const text of ['前总统特朗普','前美国总统唐纳德·特朗普','美國前總統川普','former President Donald Trump','特朗普前总统']) assert.equal(policy.officeTitleErrors({[field]:text}).length,1);
  for(const text of ['此前美国总统特朗普宣布政策','美国总统特朗普','2023年，当时的美国前总统特朗普出庭']) assert.equal(policy.officeTitleErrors({content:text}).length,0);
});
test('foreign domestic courts rejected while documented US or China involvement retained',()=>{
 for(const text of ['Russian Supreme Court denied a Sochi resident land appeal','俄罗斯索契居民控诉最高法院上诉程序不公','India Supreme Court issued a ruling']) {
  assert.equal(scope.collectionScope(text),null);
  assert.equal(routing.routeOfficialContent(text,'','',[]),null);
 }
 assert.equal(scope.collectionScope('US Supreme Court issued a ruling on asylum').key,'us-politics');
 assert.equal(scope.collectionScope('Russia announced sanctions against American companies').key,'us-politics');
 assert.equal(scope.collectionScope('俄罗斯法院判决拘留中国公民').key,'china');
 assert.equal(routing.routeOfficialContent('俄罗斯索契居民控诉最高法院','','',[{source_username:'CaucasianKnotEn'}]),null);
});
