import test from 'node:test';import assert from 'node:assert/strict';
import {insertUniqueKnowledge} from './knowledge-publication.mjs';
test('concurrent duplicate title does not abort other knowledge articles or inflate counts',async()=>{
 const duplicates=[];const saved=await insertUniqueKnowledge([{title:'existing'},{title:'new'}],async row=>{if(row.title==='existing')throw new Error('Supabase 409: {"code":"23505","message":"duplicate published article title"}');return [{...row,id:2}];},title=>duplicates.push(title));
 assert.deepEqual(duplicates,['existing']);assert.equal(saved.length,1);assert.equal(saved[0].title,'new');
});
test('other database errors and ambiguous write replies remain fatal',async()=>{
 for(const insert of [async()=>{throw new Error('Supabase 500: failed');},async()=>[],async()=>{throw new Error('Supabase 409: {"code":"23505","message":"other unique constraint"}');}])await assert.rejects(()=>insertUniqueKnowledge([{title:'new'}],insert));
});
