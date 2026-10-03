// Insert separately so a concurrent duplicate never rolls back unrelated articles.
export async function insertUniqueKnowledge(rows,insert,onDuplicate=()=>{}) {
 const saved=[];
 for(const row of rows) {
  try {const result=await insert(row);if(!Array.isArray(result)||result.length!==1)throw new Error('知识稿发布未返回唯一文章，停止并回读检查');saved.push(result[0]);}
  catch(error) {if(/Supabase 409:/.test(error.message)&&/23505/.test(error.message)&&/duplicate published article title/.test(error.message)){onDuplicate(row.title);continue;}throw error;}
 }
 return saved;
}
