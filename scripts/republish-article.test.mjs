import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import service from '../netlify/functions/_shared/republish-article.js';

const id = '12345678-1234-1234-1234-123456789abc';
const categoryId = '22345678-1234-1234-1234-123456789abc';
const actor = { user:{id:'32345678-1234-1234-1234-123456789abc'}, admin:{role:'editor'} };
const now = '2026-11-17T21:49:24Z';
const source = 'https://example.com/original';
const input = {article_id:id,category_id:categoryId,expected_updated_at:now,
  title:'编辑修改后的标题',content:'这是一段由编辑明确确认发布的内容。'.repeat(5),cover_image:'',tags:'测试'};
const deps = {validateExternalCover: x => x, assertNoPublishedDuplicate:async()=>{}};

function fixture({conflict = false} = {}) {
  const writes = [];
  const rest = async (table, request) => {
    if (request.method === 'PATCH') {
      writes.push(request);
      return conflict ? [] : [{id, status:'published', visibility:'public'}];
    }
    return table === 'categories' ? [{id:categoryId,name:'美国时政'}] : [{
      id, title:'旧标题', category_id:categoryId, category_name:'美国时政', updated_at:now, published_at:now,
      status:'published', automation_source:'china-hot-li-teacher-v2', source_url:source,
      metadata:{collector:'china-hot-li-teacher-v2',publisher_authorized_release:{content_sha256:'old'}}
    }];
  };
  return {rest,writes};
}

test('authorized edit publishes the same article without a cover and replaces stale authorization',async()=>{
  const {rest,writes} = fixture();
  const result = await service.republishArticle({...input, source_url:'https://example.com/forged', metadata:{forged:true}},actor,rest,deps);
  assert.equal(result.id,id);
  assert.equal(writes.length,1);
  const {query,body} = writes[0];
  assert.equal(query.id,'eq.'+id);
  assert.equal(query.updated_at,'eq.'+now);
  assert.equal(body.published_at,now);
  assert.equal(body.metadata.collector,'china-hot-li-teacher-v2');
  assert.equal(body.metadata.homepage_focus_override,'exclude');
  assert.equal(body.metadata.publisher_authorized_release.approved_by,actor.user.id);
  assert.equal(body.metadata.publisher_authorized_release.source_url,source);
  assert.equal(body.metadata.publisher_authorized_release.content_sha256,createHash('sha256').update(input.title+'\n'+input.content).digest('hex'));
  assert.equal(body.metadata.forged,undefined);
});

test('non-editor, stale revision, and incomplete revision cannot write',async()=>{
  const {rest,writes} = fixture();
  await assert.rejects(service.republishArticle(input,{...actor,admin:{role:'reader'}},rest,deps),{statusCode:403});
  await assert.rejects(service.republishArticle({...input,expected_updated_at:'old'},actor,rest,deps),{statusCode:409});
  await assert.rejects(service.republishArticle({...input,content:'待补写'},actor,rest,deps),{statusCode:422});
  assert.equal(writes.length,0);
});

test('a concurrent update does not return a successful publication receipt',async()=>{
  const {rest} = fixture({conflict:true});
  await assert.rejects(service.republishArticle(input,actor,rest,deps),{statusCode:409});
});
