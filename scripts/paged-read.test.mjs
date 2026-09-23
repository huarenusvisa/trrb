import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllPages,readWithRetry} from './paged-read.mjs';

test('reads beyond REST row caps without truncating the requested history',async()=>{
  const dataset=Array.from({length:1853},(_,id)=>({id}));
  const result=await readAllPages(async({limit,offset})=>{
    assert.ok(Number(limit)<=200);
    return dataset.slice(Number(offset),Number(offset)+Number(limit));
  },{maxRows:2000});
  assert.deepEqual(result,dataset);
});
test('retries timeouts but propagates missing data and permanent failures',async()=>{
  let calls=0;
  assert.deepEqual(await readWithRetry(async()=>{if(++calls<3)throw Error('500: statement timeout');return [1];},{wait:async()=>{}}),[1]);
  assert.equal(calls,3);
  await assert.rejects(readWithRetry(async()=>{throw Error('503 unavailable');},{wait:async()=>{}}),/503/);
  calls=0;
  await assert.rejects(readWithRetry(async()=>{calls++;throw Error('403 denied');},{wait:async()=>{}}),/403/);
  assert.equal(calls,1);
});
