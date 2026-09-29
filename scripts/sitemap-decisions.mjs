import {createHash} from 'node:crypto';
// Bind exclusions to the exact content/category snapshot; a later edit needs review.
export function sitemapArticleSignature(a) {
  const fields=['id','title','summary','content','category_id','category_name','topic_key','publication_path','published_at'];
  return createHash('sha256').update(JSON.stringify(fields.map(k=>a[k] ?? null).concat([
    a.knowledge_migration_batch ?? a.metadata?.knowledge_migration_batch ?? null,
    a.knowledge_path ?? a.metadata?.knowledge_path ?? null,
    a.knowledge_topic ?? a.metadata?.knowledge_topic ?? null
  ]))).digest('hex');
}
export function createSitemapDecisions() {
  const bodies=new Map();
  const exclusions=[];
  return {
    exclusions,
    exclude(article,reason,duplicateOf=null) {exclusions.push({id:article.id,signature:sitemapArticleSignature(article),reason,duplicateOf});},
    duplicateOf(article,body) {
      if(body.length<120)return null;
      const key=createHash('sha256').update(body).digest('hex');
      const previous=bodies.get(key);
      if(previous)return previous;
      bodies.set(key,article.id);return null;
    }
  };
}
export function verifiedSitemapExclusion(article,manifest,now=new Date()) {
  const age=now.getTime()-Date.parse(manifest?.generatedAt);
  if(manifest?.version!==1 || !Number.isFinite(age) || age<0 || age>48*60*60*1000)return null;
  const decision=manifest.exclusions?.find(x=>x.id===article.id);
  return decision && ['category-policy','exact-body-duplicate','empty-content','invalid-url'].includes(decision.reason) && decision.signature===sitemapArticleSignature(article) ? decision : null;
}
