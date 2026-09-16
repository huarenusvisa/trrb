import test from 'node:test';
import assert from 'node:assert/strict';
import {readPoliticalPage} from '../netlify/shared/political-page.mjs';
const foreign=Array.from({length:24},(_,i)=>({id:`us-${i}`,title:'美国国防部长回应任命争议'}));
const relevant=[
 {id:'health',title:'习近平印度行突传健康风波：网传峰会晕倒后提前返华'},
 {id:'visit',title:'特朗普驳斥习近平访美峰会生变传闻：美中“关系很好”'},
 {id:'appointment',title:'省委书记履新'}
];
const rows=[...foreign,...relevant];
const read=async({offset,limit})=>rows.slice(offset,offset+limit);
test('foreign keyword candidates do not displace the two screenshot articles',async()=>{
 const page=await readPoliticalPage(read,{limit:2,batchSize:10});
 assert.deepEqual(page.rows.map(r=>r.id),['health','visit']);
 assert.equal(page.has_more,true);assert.equal(page.next_offset,26);
 const next=await readPoliticalPage(read,{limit:2,offset:page.next_offset,batchSize:10});
 assert.deepEqual(next.rows.map(r=>r.id),['appointment']);assert.equal(next.has_more,false);
});
test('numbered website pages skip qualified articles, not unrelated candidates',async()=>{
 const page=await readPoliticalPage(read,{limit:2,skip:2,batchSize:10});
 assert.deepEqual(page.rows.map(r=>r.id),['appointment']);assert.equal(page.has_more,false);
});
test('scan failures never masquerade as an empty completed page',async()=>{
 await assert.rejects(readPoliticalPage(read,{limit:2,batchSize:10,maxBatches:1}),/scan limit/);
 await assert.rejects(readPoliticalPage(async()=>null),/Invalid/);
});
