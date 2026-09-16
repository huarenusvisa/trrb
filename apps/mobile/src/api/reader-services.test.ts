import test from 'node:test';
import assert from 'node:assert/strict';
import {subscribeReader, submitReaderTip} from './reader-services.ts';

test('reader forms validate input before making requests',async t=>{
 const fetcher=t.mock.method(globalThis,'fetch',async()=>new Response('',{status:200}));
 await assert.rejects(subscribeReader('wrong'),{code:'email'});
 await assert.rejects(submitReaderTip({message:'   '}),{code:'message'});
 await assert.rejects(submitReaderTip({message:'文'.repeat(10001)}),{code:'message'});
 assert.equal(fetcher.mock.callCount(),0);
});
test('registered forms receive encoded email and Chinese text with exact field names',async t=>{
 const requests: RequestInit[]=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://trrb.net/thanks');requests.push(options);return new Response('',{status:200});});
 await subscribeReader(' reader+news@example.com ');
 await submitReaderTip({message:' 纽约线索 & 时间=今天 ',name:'读者',contact:'微信'});
 const subscription=new URLSearchParams(String(requests[0].body));
 assert.equal(subscription.get('email'),'reader+news@example.com');assert.equal(subscription.get('form-name'),'daily-subscribe');
 const tip=new URLSearchParams(String(requests[1].body));
 assert.equal(tip.get('form-name'),'news-tip');assert.equal(tip.get('message'),'纽约线索 & 时间=今天');assert.equal(tip.get('contact'),'微信');assert.equal(tip.get('bot-field'),'');
});
test('failed requests remain failures and are not automatically resubmitted',async t=>{
 const fetcher=t.mock.method(globalThis,'fetch',async()=>new Response('',{status:503}));
 await assert.rejects(subscribeReader('reader@example.com'),{code:'failed'});assert.equal(fetcher.mock.callCount(),1);
 fetcher.mock.mockImplementation(async()=>{throw new Error('network unavailable');});
 await assert.rejects(submitReaderTip({message:'测试线索'}),{code:'failed'});assert.equal(fetcher.mock.callCount(),2);
});
