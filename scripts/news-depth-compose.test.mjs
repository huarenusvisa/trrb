import test from 'node:test';import assert from 'node:assert/strict';
import {composeDepthDraft} from './news-depth-compose.mjs';
const research={text:'已检索资料',sources:[],depth_assignment:{requested_depth:'deep',sections:Array.from({length:6},(_,i)=>({question:`问题${i}`,facts:[]}))}};
test('assembles evidence sections and supplies prior paragraphs to prevent repetition',async()=>{
 let calls=0;const draft={title:'原标题',content:'短稿'};
 const r=await composeDepthDraft({draft,research,source:'来源',invoke:async p=>{const input=JSON.parse(p.input);assert.equal(input.previous_paragraphs.length,calls);calls++;return {content:String.fromCharCode(0x4e00+calls).repeat(410),sufficient:true,missing_evidence:''};}});
 assert.equal(calls,6);assert.equal(r.title,draft.title);assert.equal(r.content.split('\n\n').length,6);assert.equal(r.editorial_review,undefined);
});
test('refusal stops composition and never converts missing facts into success',async()=>{
 let calls=0;await assert.rejects(composeDepthDraft({draft:{},research,invoke:async()=>{calls++;return{content:'',sufficient:false,missing_evidence:'没有原始文件'};}}),/没有原始文件/);assert.equal(calls,1);
});
