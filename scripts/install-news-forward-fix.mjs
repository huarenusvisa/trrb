// One-shot source repair. No database access, no secrets, no network calls.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const files=new Map();
const cutoff=new Date().toISOString();
function read(path){if(!files.has(path))files.set(path,readFileSync(path,'utf8'));return files.get(path);}
function replace(path,from,to){const s=read(path);const n=typeof from==='string'?s.split(from).length-1:[...s.matchAll(new RegExp(from.source,from.flags.includes('g')?from.flags:from.flags+'g'))].length;if(n!==1)throw new Error(`${path}: expected exactly one patch anchor, got ${n}: ${String(from).slice(0,100)}`);files.set(path,s.replace(from,to));}
function imports(path,names){const s=read(path),line=`import {${names}} from './news-forward-policy.mjs';\n`;if(s.includes(line))throw new Error('Repair already applied: '+path);files.set(path,s.startsWith('#!')?s.replace(/\n/,'\n'+line):line+s);}
const checked={
 'scripts/ice-fast-intake.mjs':'0ec6f7b327b63bc637f632daddc6d8889c80c2bf',
 'scripts/ice-translate-title-body.mjs':'cbbb9f40b47d0af5f8812b1e8b42c37b6c8a3f33',
 'scripts/china-hot-li-teacher-ingest.mjs':'e04b50c5e6480afc62cd94f39a9b92c29736fd21',
 'scripts/china-context-research.mjs':'4aa2642077831fda91ef4dab8e3ab23d7f4b1c94',
 'scripts/ice-precollect-published-dedupe.mjs':'2084b18457414cdedd3415139615b9f3594886cc',
 'scripts/ice-publish-due.mjs':'f0c8ba62d3540639153fc516482e8f59c4fc3779'
};
for(const [path,sha] of Object.entries(checked))if(execFileSync('git',['hash-object',path],{encoding:'utf8'}).trim()!==sha)throw new Error('Source changed since review; stop without overwriting: '+path);

const intake='scripts/ice-fast-intake.mjs';
imports(intake,'forwardQuery,inForwardScope,officialEventRelation,officialPostSignature');
replace(intake,'  const text = safeText(post.source_text, 30000);\n  // Never use',"  const directSignature = officialPostSignature(post);\n  if (directSignature) return directSignature;\n  const text = safeText(post.source_text, 30000);\n  // Never use");
replace(intake,'function distinctOfficialReleases(a,b) {',"function distinctOfficialReleases(a,b) {\n  const relation = officialEventRelation(a,b);\n  if (relation !== null) return relation === false;");
replace(intake,'    if (story.event_fingerprint === signature) return true;',"    const relation = officialEventRelation(post,story);\n    if (relation !== null) return relation;\n    if (story.event_fingerprint === signature) return true;");
replace(intake,'async function pendingPosts() {\n  const rows', 'async function pendingPosts() {\n  const rows');
replace(intake,'      processing_status: "in.(collected,processing,extracted,failed)",','      ...forwardQuery(),\n      processing_status: "in.(collected,processing,extracted,failed)",');
replace(intake,'async function createCandidate(post) {\n  const fingerprint = eventSignature(post);',"async function createCandidate(post, separateForwardUpdate = false) {\n  const fingerprint = separateForwardUpdate ? `forward-${hash(post.x_post_id || post.id).slice(0,40)}` : eventSignature(post);");
replace(intake,'lead_source_post_id: post.x_post_id || "",','lead_source_post_id: post.x_post_id || "", lead_source_type: post.source_type || "", lead_source_trust_tier: post.trust_tier, lead_source_created_at: post.source_created_at || null,');
replace(intake,'        if (hasMaterialUpdate(post, duplicate)) {\n          await mergeIntoStory(duplicate, post);',"        if (hasMaterialUpdate(post, duplicate)) {\n          if (!inForwardScope(duplicate)) {\n            const freshStory = await createCandidate(post,true);\n            recentStories.unshift(freshStory); visible += 1; continue;\n          }\n          await mergeIntoStory(duplicate, post);");
replace(intake,'    stage: "ice-fast-intake-v3",','    stage: "ice-fast-intake-v4-official-identity",');

const pre='scripts/ice-precollect-published-dedupe.mjs';
imports(pre,'forwardQuery,officialEventRelation');
replace(pre,'source_type,source_username,source_created_at,created_at,event_fingerprint','source_type,trust_tier,x_url,source_username,source_created_at,created_at,event_fingerprint');
replace(pre,'processing_status:"in.(collected,processing,extracted,failed)"','...forwardQuery(),processing_status:"in.(collected,processing,extracted,failed)"');
replace(pre,'(post.event_fingerprint&&story.event_fingerprint===post.event_fingerprint)||isSimilar(raw,combinedStoryText(story))','officialEventRelation(post,story) ?? ((post.event_fingerprint&&story.event_fingerprint===post.event_fingerprint)||isSimilar(raw,combinedStoryText(story)))');
replace(pre,'(post.event_fingerprint&&eventFingerprintOfArticle(article)===post.event_fingerprint)||isSimilar(raw,combinedArticleText(article))','officialEventRelation(post,article) ?? ((post.event_fingerprint&&eventFingerprintOfArticle(article)===post.event_fingerprint)||isSimilar(raw,combinedArticleText(article)))');

const translator='scripts/ice-translate-title-body.mjs';
imports(translator,'forwardQuery,depthInstruction,logDepthOutcome');
const sbStart='async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {';
const sbScoped=sbStart+"\n  if(method === 'GET' && table === 'ice_stories' && /approved/.test(query.status || '') && !/published/.test(query.status || '')) query = {...query,...forwardQuery()};";
replace(translator,sbStart,sbScoped);
replace(translator,'catch (error) { researchError = String(error.message || error).slice(0,500); }','catch (error) { if(isBudgetDeferred(error)) throw error; researchError = String(error.message || error).slice(0,500); }');
replace(translator,"const canDeep = !context.force_standard && independentSourceCount(context.research) >= 2;","const canDeep = !context.force_standard && independentSourceCount(context.research) >= 2 && (!context.research?.depth_assignment || context.research.depth_assignment.requested_depth === 'deep');");
replace(translator,"        context.rewrite_reason || ''","        context.force_standard ? '' : depthInstruction(context.research),\n        context.rewrite_reason || ''");
replace(translator,"requestedDepth==='deep' && canDeep && count<2000 && attempt<1","(requestedDepth==='deep' || context.research?.depth_assignment?.requested_depth==='deep') && canDeep && count<2000 && attempt<1");
replace(translator,'  return {...parsed,editorial_review:review,','  logDepthOutcome(context.research,depth,count);\n  return {...parsed,editorial_review:review,');
replace(translator,'...payload, ...reviewPayload, translation_version: VERSION','...payload, ...reviewPayload, editorial_failure: null, translation_version: VERSION');

for(const path of ['scripts/ice-trusted-source-promote.mjs','scripts/ice-publish-due.mjs']){
 imports(path,'forwardQuery');replace(path,sbStart,sbScoped);
}

const research='scripts/china-context-research.mjs';
imports(research,'commissionDepth');
replace(research,"try {thread = await readThread(tweet, {request, readJson, bearer});}","try {if(editorialDepth !== 'deep' || process.env.NEWS_DEPTH_COMMISSION !== '1') thread = await readThread(tweet, {request, readJson, bearer});}");
replace(research,'max_output_tokens: 5500, max_tool_calls: 5','max_output_tokens: process.env.NEWS_DEPTH_COMMISSION === \'1\' ? 7500 : 5500, max_tool_calls: process.env.NEWS_DEPTH_COMMISSION === \'1\' ? 7 : 5');
replace(research,'  const research = citedResearch(response);',"  let research = citedResearch(response);\n  if (research && editorialDepth === 'deep' && process.env.NEWS_DEPTH_COMMISSION === '1') {\n    research = await commissionDepth(research,{request,readJson,model,key});\n    console.log(JSON.stringify({event:'news-depth-assignment',source_id:tweet.id,requested_depth:research.depth_assignment.requested_depth,reason:research.depth_assignment.reason,missing_material:research.depth_assignment.missing_material}));\n  }");
replace(research,'return {text: research?.text ||','return {depth_assignment: research?.depth_assignment || null, text: research?.text ||');

const china='scripts/china-hot-li-teacher-ingest.mjs';
imports(china,'inForwardScope,depthInstruction,logDepthOutcome');
replace(china,'      instructions: [\n        DEEP_RESEARCH_INSTRUCTIONS,',"      instructions: [\n        DEEP_RESEARCH_INSTRUCTIONS,\n        !brief && mode !== 'standard' ? depthInstruction(tweet.context_research) : '',");
replace(china,'  if (!brief && article.editorial_depth === "deep" && article.source_sufficient === true && bodyCharacterCount(article.content) < 2000 && attempt < 1) {',"  if (!brief && mode !== 'standard' && (article.editorial_depth === \"deep\" || tweet.context_research?.depth_assignment?.requested_depth === 'deep') && article.source_sufficient === true && bodyCharacterCount(article.content) < 2000 && attempt < 1) {");
replace(china,'  assertPublicationQuality(tweet, article);\n  return { ...article,','  assertPublicationQuality(tweet, article);\n  logDepthOutcome(tweet.context_research,article.editorial_depth,bodyCharacterCount(article.content));\n  return { ...article,');
replace(china,'  const retryRows = await reprocessableCandidates();','  const retryRows = (await reprocessableCandidates()).filter(inForwardScope);');
replace(china,'    const priorCandidate = await existingCandidate(tweet);\n    if (priorCandidate?.ai_payload?.manual_editor_lock)',"    const priorCandidate = await existingCandidate(tweet);\n    if (priorCandidate && !inForwardScope(priorCandidate)) {counters.duplicate++;results.push({tweetId:tweet.id,status:'historical-not-reprocessed'});continue;}\n    if (priorCandidate?.ai_payload?.manual_editor_lock)");
replace(china,'const reason=existing && await verifyArticleUpdate','const reason=existing && inForwardScope(existing) && await verifyArticleUpdate');
// Neither cleanup nor explicit backfill is part of this forward-only repair.
replace(china,/const deletedUnusableBacklog = await (\w+)\(\);/,'const deletedUnusableBacklog = process.env.NEWS_FORWARD_ONLY_FROM ? 0 : await $1();');
replace(china,/const deletedDuplicateBacklog = await (\w+)\(\);/,'const deletedDuplicateBacklog = process.env.NEWS_FORWARD_ONLY_FROM ? 0 : await $1();');

const iceWorkflow='.github/workflows/ice-unified-pipeline.yml';
const workflowCandidates=readdirSync('.github/workflows').filter(p=>p.endsWith('.yml')).map(p=>'.github/workflows/'+p).filter(p=>readFileSync(p,'utf8').includes('collect-to-content-center:')&&readFileSync(p,'utf8').includes('scripts/china-hot-li-teacher-ingest.mjs'));
if(workflowCandidates.length!==1)throw new Error('Cannot uniquely identify existing China production workflow');
for(const path of [iceWorkflow,workflowCandidates[0]]){
 const s=read(path),pattern=/^(\s*)NEWS_BUDGET_ENFORCE:.*$/m;
 if(!pattern.test(s))throw new Error('Missing budget env anchor: '+path);
 files.set(path,s.replace(pattern,(line,indent)=>line+'\n'+indent+'NEWS_DEPTH_COMMISSION: "1"\n'+indent+'NEWS_FORWARD_ONLY_FROM: "'+cutoff+'"'));
 const body=read(path),anchor='      - name: Validate required secrets';
 if(path===iceWorkflow)replace(path,anchor,'      - name: Validate forward-only intake and deep commissioning\n        env:\n          NEWS_BUDGET_ENFORCE: "0"\n        run: node --test scripts/news-forward-policy.test.mjs\n\n'+anchor);
}
// Fast intake supplies raw evidence directly to the canonical reviewed writer.
// Remove obsolete rewrite/cleanup passes, not the fact, freshness or final gates.
let workflow=read(iceWorkflow);
for(const script of ['ice-ai-process-only.mjs','ice-editorial-normalize.mjs','ice-dedupe-v3.mjs','ice-clean-existing-review-duplicates.mjs','ice-cross-language-dedupe.mjs','ice-restore-human-approved.mjs','ice-filter-replies.mjs','ice-drop-stale-posts.mjs','ice-english-pretranslation-dedupe.mjs']){
 const escaped=script.replace(/\./g,'\\.');
 const pattern=new RegExp('^.*node scripts/'+escaped+'[^\\n]*\\n','gm');
 if(!pattern.test(workflow))throw new Error('Missing obsolete pipeline step: '+script);
 workflow=workflow.replace(pattern,'');
}
files.set(iceWorkflow,workflow);
const quality='scripts/news-quality-report.mjs';
imports(quality,'inForwardScope');
replace(quality,'if(n>2000)group.over_2000++','if(n>=2000)group.over_2000++');
replace(quality,"select:'id,title,content,status,visibility,published_at,automation_source,metadata'","select:'id,title,content,status,visibility,created_at,published_at,automation_source,metadata'");
replace(quality,'const report=publicationQualityReport(rows,{now});console.log(JSON.stringify(report));',"const report=publicationQualityReport(rows,{now});\n  if(process.env.NEWS_FORWARD_ONLY_FROM)report.forward_only={since:process.env.NEWS_FORWARD_ONLY_FROM,...publicationQualityReport(rows.filter(inForwardScope),{now})};\n  report.counting_note='统计发布流水线，不等同于前台栏目；>=2000字与通过独立复核的深度稿分别计数';\n  console.log(JSON.stringify(report));\n  const scope=report.forward_only || report;\n  for(const [name,g] of Object.entries(scope.groups))if(g.published>=10&&g.deep===0)console.log(`::warning title=深度稿产出缺口::${name}: ${g.published}篇新增发布，合格深度稿0篇；检查news-depth-assignment和news-depth-outcome，不得凑字或降低审核。`);");

for(const [path,content] of files){if(path.endsWith('.mjs')){const tmp=path+'.forward-check.mjs';writeFileSync(tmp,content);try{execFileSync('node',['--check',tmp],{stdio:'inherit'});}finally{execFileSync('rm',['-f',tmp]);}}}
for(const [path,content] of files)writeFileSync(path,content);
writeFileSync('.news-forward-apply.json',JSON.stringify({cutoff,changed_files:[...files.keys()]},null,2));
console.log(JSON.stringify({event:'forward-news-source-repair',cutoff,changed_files:[...files.keys()]}));
