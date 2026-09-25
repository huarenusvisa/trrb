import test from 'node:test';
import assert from 'node:assert/strict';
import {newsPriority,compareNewsPriority,sourceFingerprint,editorialRetryAllowed} from './news-priority.mjs';
import {shouldRetryCandidate} from './china-hot-li-teacher-ingest.mjs';
const now=Date.now();
const primary={source_created_at:new Date(now-60000).toISOString(),source_text:'Federal court issued injunction on immigration policy, docket released',source_type:'official',trust_tier:1};
test('fresh primary court/policy evidence outranks viral commentary; followers confer no factual rank',()=>{
 const viral={...primary,source_type:'monitored_individual',trust_tier:4,source_text:'Opinion: immigration policy announced',verified:true,public_metrics:{followers_count:10000000}};
 assert.ok(newsPriority(primary).score>newsPriority(viral).score);
 assert.deepEqual([viral,primary].sort(compareNewsPriority),[primary,viral]);
 assert.equal(newsPriority({...viral,verified:false,public_metrics:{}}).score,newsPriority(viral).score);
});
test('official websites also fail strict 12-hour rule; unknown/future date fails',()=>{
 for(const date of [new Date(now-12*3600000-1).toISOString(),'unknown',new Date(now+1000).toISOString()]) assert.equal(newsPriority({...primary,source_created_at:date},now).eligible,false);
 assert.equal(newsPriority({...primary,source_created_at:new Date(now-12*3600000).toISOString()},now).eligible,true);
});
test('same evidence gets max two attempts, with backoff; new evidence unlocks research',()=>{
 const posts=[primary]; const fp=sourceFingerprint(posts);
 assert.equal(editorialRetryAllowed({ai_payload:{editorial_attempt:{fingerprint:fp,count:2,at:new Date(now-7200000).toISOString()}}},posts,now),false);
 assert.equal(editorialRetryAllowed({ai_payload:{editorial_attempt:{fingerprint:fp,count:1,at:new Date(now).toISOString()}}},posts,now),false);
 assert.equal(editorialRetryAllowed({ai_payload:{editorial_attempt:{fingerprint:fp,count:2,at:new Date(now).toISOString()}}},[{...primary,source_text:primary.source_text+' new appeal filed'}],now),true);
});
test('budget hold remains retryable while fresh, but cannot bypass manual hold or age limit',()=>{
 const candidate={decision:'review_required',raw_payload:{source_created_at:primary.source_created_at},ai_payload:{budget_deferred:true,quality_hold:true}};
 assert.equal(shouldRetryCandidate(candidate,{accepted:true},now),true);
 assert.equal(shouldRetryCandidate({...candidate,raw_payload:{source_created_at:new Date(now-13*3600000).toISOString()}},{accepted:true},now),false);
 assert.equal(shouldRetryCandidate({...candidate,ai_payload:{...candidate.ai_payload,manual_review_required:true}},{accepted:true},now),false);
});

test('priority ranking does not silently exclude new policy wording outside the scoring vocabulary',()=>{
 assert.equal(newsPriority({...primary,source_text:'White House vetoes legislation; full text attached'}).eligible,true);
});
