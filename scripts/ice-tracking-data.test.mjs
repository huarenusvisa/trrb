import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {normalizeRow,dedupe,summarize}=createRequire(import.meta.url)('../topic/ice/tracking-data.js');
test('cumulative and daily average headlines cannot inflate 24h people totals',()=>{
  const now=Date.parse('2026-09-16T12:00:00Z');const time='2026-09-16T10:00:00Z';
  const rows=[{id:'1',title:'ICE在纽约拘留12人',metadata:{people_count:12},published_at:time},{id:'2',title:'特朗普任内ICE日均抓捕952人',metadata:{people_count:952},published_at:time},{id:'3',title:'ICE年度拘留人数',metadata:{people_count:20000},published_at:time}].map(normalizeRow);
  const stats=summarize(rows,24,now);assert.equal(stats.people,12);assert.equal(stats.excluded,2);assert.equal(stats.reports,3);
  assert.equal(summarize(rows,24,now-86400000).reports,0);
});
test('same source/event is counted once; distinct events remain',()=>{
  const rows=[{id:'1',title:'第一篇',source_url:'https://x.com/u/status/1'},{id:'2',title:'转载第一篇',source_url:'https://x.com/u/status/1?s=20'},{id:'3',title:'第二篇',source_url:'https://x.com/u/status/2'}];assert.equal(dedupe(rows).length,2);
});
