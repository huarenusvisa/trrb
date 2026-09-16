import test from 'node:test';
import assert from 'node:assert/strict';
import {CHINA_PEOPLE_SEED} from '../netlify/shared/china-people-seed.mjs';
import {configureChinaPeople,findChinaPeople,loadChinaPeople} from '../netlify/shared/china-person-registry.mjs';
import {CHINA_X_SOURCES,chinaMediaQueries} from './china-x-sources.mjs';

test('current identities have provenance; historical watch subjects are not declared current',()=>{
 assert.equal(new Set(CHINA_PEOPLE_SEED.map(p=>p.person_key)).size,92);
 assert.equal(CHINA_PEOPLE_SEED.filter(p=>p.status==='listed_current').length,88);
 for(const person of CHINA_PEOPLE_SEED) {
  if(person.status==='listed_current') {assert.match(person.source_url,/^https:\/\//);assert.ok(person.verified_at);assert.ok(person.roles.length);}
  assert.deepEqual(person.relationship_claims,[]);
 }
 assert.equal(CHINA_PEOPLE_SEED.find(p=>p.name==='薄熙来').status,'watch_only');
 assert.equal(CHINA_PEOPLE_SEED.find(p=>p.name==='王祥喜').status,'former');
});
test('aliases resolve one identity while common short names require government context',()=>{
 assert.equal(findChinaPeople('李干傑與李幹傑公开活动').length,1);
 assert.equal(findChinaPeople('李强会见来访代表团')[0].name,'李强');
 assert.deepEqual(findChinaPeople('演员刘伟参加演出'),[]);
 assert.equal(findChinaPeople('交通运输部部长刘伟参加会议')[0].name,'刘伟');
});
test('every enabled alias participates in bounded source-restricted X queries',()=>{
 for(const source of CHINA_X_SOURCES) {
  const queries=chinaMediaQueries(source);
  for(const query of queries) {assert.ok(query.length<=512);assert.ok(query.startsWith(`from:${source.handle} (`));}
  const joined=queries.join(' ');
  for(const person of CHINA_PEOPLE_SEED) for(const alias of person.aliases) assert.ok(joined.includes(alias),alias);
 }
});
test('database changes disable a name and a failed refresh preserves the last valid registry',async t=>{
 t.after(()=>configureChinaPeople(CHINA_PEOPLE_SEED));
 const rows=CHINA_PEOPLE_SEED.map(p=>({...p,scope_enabled:p.name!=='习近平'}));
 await loadChinaPeople(async()=>rows,{force:true});
 assert.deepEqual(findChinaPeople('习近平公开活动'),[]);
 t.mock.method(console,'warn',()=>{});
 const retained=await loadChinaPeople(async()=>[],{force:true});
 assert.equal(retained.length,91);
 assert.deepEqual(findChinaPeople('习近平公开活动'),[]);
 assert.equal(findChinaPeople('李强会见来访代表团')[0].name,'李强');
});
