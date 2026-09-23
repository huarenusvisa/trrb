import assert from 'node:assert/strict';
import test from 'node:test';
import {readCategoryGate} from './category-pipeline-gate.mjs';

test('ICE uses the merged category and respects disabled publication without writes', async () => {
  const result = await readCategoryGate('ice', {base:'https://example.com',key:'test',request:async (url,options)=>{
    assert.equal(url.searchParams.get('slug'),'eq.iceandpolice');
    assert.equal(options.method,undefined);
    return Response.json([{is_active:true,auto_fetch:true,ai_rewrite:true,auto_publish:false}]);
  }});
  assert.equal(result.auto_fetch,true);
  assert.equal(result.auto_publish,false);
});

test('missing or unreadable categories fail closed and are never recreated', async () => {
  for (const response of [Response.json([]),new Response('',{status:503})]) {
    let calls=0;
    await assert.rejects(readCategoryGate('ice',{base:'https://example.com',key:'test',request:async()=>{calls++;return response;}}));
    assert.equal(calls,1);
  }
});
