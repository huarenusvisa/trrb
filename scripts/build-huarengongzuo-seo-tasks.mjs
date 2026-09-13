import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const ORIGIN='https://huarengongzuo.com';
export function buildTasks(current,previous=null){
  if(current.complete!==true || (previous && previous.complete!==true)) throw new Error('Complete snapshots required; refusing unsafe deletions');
  const validate=(rows)=>new Map(rows.map(row=>{
    const url=new URL(row.url);
    if(url.origin!==ORIGIN || url.hash || url.username || url.password) throw new Error('Foreign or noncanonical URL');
    return [url.href,row];
  }));
  const now=validate(current.urls), before=validate(previous?.urls||[]);
  const tasks=[];
  for(const [url,row] of now){
    const old=before.get(url);
    if(!old || old.fingerprint!==row.fingerprint){
      const action=old?'update':'add';
      tasks.push({id:createHash('sha256').update(`${action}\n${url}\n${row.fingerprint}`).digest('hex'),action,url,lastmod:row.lastmod||null});
    }
  }
  for(const [url,row] of before) if(!now.has(url)) tasks.push({id:createHash('sha256').update(`delete\n${url}\n${row.fingerprint}`).digest('hex'),action:'delete',url});
  return {version:1,site:'huarengongzuo',origin:ORIGIN,generated_at:current.generated_at,baseline:previous?'previous-complete-snapshot':'initial-complete-snapshot',dispatch:false,tasks};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [currentPath,previousPath,outputPath]=process.argv.slice(2);
  if(!currentPath || !outputPath) throw new Error('Usage: node scripts/build-huarengongzuo-seo-tasks.mjs current.json previous.json|- output.json');
  const current=JSON.parse(await readFile(currentPath,'utf8'));
  const previous=previousPath==='-'?null:JSON.parse(await readFile(previousPath,'utf8'));
  const result=buildTasks(current,previous);
  await writeFile(outputPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({total:result.tasks.length,add:result.tasks.filter(x=>x.action==='add').length,update:result.tasks.filter(x=>x.action==='update').length,delete:result.tasks.filter(x=>x.action==='delete').length,dispatch:false}));
}
