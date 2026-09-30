import {spawnSync} from 'node:child_process';

// Reuse only the repository's existing persistent dispatch credentials.
// Never copy the ephemeral Actions GITHUB_TOKEN into production.
const keys=['REPAIR_DISPATCH_TOKEN','REPAIR_GH_PAT','REPAIR_PERSONAL_TOKEN'];
let selected;
for (const key of keys) {
  const token=process.env[key];
  if (!token) continue;
  const response=await fetch('https://api.github.com/repos/huarenusvisa/trrb/actions/workflows/operations-control-plane.yml/dispatches',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'main',inputs:{module:'seo'}}),signal:AbortSignal.timeout(30000)
  });
  console.log(`${key}: workflow dispatch HTTP ${response.status}`);
  if (response.status===204) {selected=token;break;}
}
if (!selected) {
  console.log('No valid persistent dispatch credential available; production credential was not changed.');
  process.exitCode=1;
} else {
  const result=spawnSync('npx',['--yes','netlify-cli','env:set','GITHUB_AUTOMATION_TOKEN',selected,'--secret','--context','production','--scope','functions','--site',process.env.NETLIFY_SITE_ID,'--force'],{encoding:'utf8',stdio:'pipe',timeout:180000});
  // CLI output may contain the value; never emit captured stdout/stderr.
  console.log(`Production dispatch credential synchronization: ${result.status===0?'success':'failed'}`);
  if(result.status!==0)process.exitCode=1;
}
