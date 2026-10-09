// Insert separately so a concurrent duplicate never rolls back unrelated articles.
const statementTimedOut=error=>/Supabase 5\d\d:[\s\S]*(?:57014|statement timeout)|canceling statement due to statement timeout/i.test(String(error?.message||error));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function insertUniqueKnowledge(rows,insert,onDuplicate=()=>{},{sleep=wait,maxAttempts=3}={}) {
 const saved=[];
 for(const row of rows) {
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
   try {const result=await insert(row);if(!Array.isArray(result)||result.length!==1)throw new Error('知识稿发布未返回唯一文章，停止并回读检查');saved.push(result[0]);break;}
   catch(error) {
    if(/Supabase 409:/.test(error.message)&&/23505/.test(error.message)&&/duplicate published article title/.test(error.message)){onDuplicate(row.title);break;}
    if(statementTimedOut(error)&&attempt<maxAttempts){console.warn(`[knowledge] database statement timeout for ${row.id||row.title}; retry ${attempt}/${maxAttempts-1}`);await sleep(attempt*1500);continue;}
    throw error;
   }
  }
 }
 return saved;
}
