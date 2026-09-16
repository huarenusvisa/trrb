import {isChinaPolitical} from './editorial-topics.mjs';

// Apply membership before limiting a page. Raw keyword matches include foreign
// ministers and must not consume the display slots reserved for China politics.
export async function readPoliticalPage(readBatch,{limit=20,offset=0,skip=0,batchSize=100,maxBatches=50}={}) {
 const rows=[]; let cursor=offset, nextOffset=offset, remaining=skip;
 for(let batch=0;batch<maxBatches;batch++) {
  const candidates=await readBatch({offset:cursor,limit:batchSize});
  if(!Array.isArray(candidates)) throw new Error('Invalid political article response');
  for(let i=0;i<candidates.length;i++) {
   const row=candidates[i];
   if(!isChinaPolitical(row)) continue;
   if(remaining>0) {remaining--;continue;}
   if(rows.length===limit) return {rows,has_more:true,next_offset:nextOffset};
   rows.push(row);nextOffset=cursor+i+1;
  }
  cursor+=candidates.length;
  if(candidates.length<batchSize) return {rows,has_more:false,next_offset:null};
 }
 throw new Error('Political article scan limit reached; retry with a narrower filter');
}
