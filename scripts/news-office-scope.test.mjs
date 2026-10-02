import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../netlify/functions/_shared/news-editorial-policy.js';
import scope from '../netlify/functions/_shared/news-collection-scope.js';
import routing from '../netlify/functions/_shared/official-content-routing.js';
import fs from 'node:fs';
import vm from 'node:vm';
test('current titles blocked in title, summary and body; historical dates and 此前 preserved',()=>{
  for(const field of ['title','summary','content','seo_title']) for(const text of ['前总统特朗普','前美国总统唐纳德·特朗普','美國前總統川普','former President Donald Trump','特朗普前总统']) assert.equal(policy.officeTitleErrors({[field]:text}).length,1);
  for(const text of ['此前美国总统特朗普宣布政策','美国总统特朗普','2023年，当时的美国前总统特朗普出庭']) assert.equal(policy.officeTitleErrors({content:text}).length,0);
});
test('eligible cross-border stories and criminal investigations route without publisher geography',()=>{
 const source=fs.readFileSync(new URL('./china-hot-li-teacher-ingest.mjs',import.meta.url),'utf8');
 const start=source.indexOf('function collectedArticleRoute(');
 const end=source.indexOf('export function matchesCollectedRoute',start);
 const context={newsScope:scope,isChinaPolitical:()=>false,isUsPoliticalReport:()=>false};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 assert.equal(context.collectedArticleRoute('菲律宾驱离中国科考船','据美国之音报道，菲律宾海警宣布驱离中国科考船'), 'china');
 assert.equal(context.collectedArticleRoute('美国四名参议员呼吁调查中国非法大麻业务','参议员致函司法部要求调查'), 'us-politics');
 assert.equal(context.collectedArticleRoute('纽约检方重启康奈尔大学性侵案刑事调查'), 'us-enforcement');
 assert.equal(scope.collectionScope('据美国之音报道，俄罗斯法院宣布索契居民土地上诉裁定'),null);
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
