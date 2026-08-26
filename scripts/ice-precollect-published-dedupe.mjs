#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_SOURCE_AGE_MINUTES = Number(process.env.ICE_MAX_SOURCE_AGE_MINUTES || 60);
const RECENT_WINDOW_MINUTES = Number(process.env.ICE_RECENT_DUPLICATE_WINDOW_MINUTES || 60);
const PUBLISHED_LOOKBACK_DAYS = Number(process.env.ICE_PUBLISHED_DEDUPE_DAYS || 30);
const SIMILARITY_THRESHOLD = Number(process.env.ICE_PUBLISHED_SIMILARITY_THRESHOLD || 0.38);

function safeText(value, max = 30000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function safeJson(value, fallback = {}) { if (value && typeof value === "object") return value; try { return JSON.parse(String(value || "")); } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function cutoffMinutes(minutes) { return new Date(Date.now() - minutes * 60000).toISOString(); }
function cutoffDays(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
function requireEnv() { const missing = REQUIRED.filter((name) => !process.env[name]); if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`); }
function headers(prefer = "") { return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function readJson(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return { raw: text }; } }
async function request(url, options = {}) { const response = await fetch(url, options); const body = await readJson(response); if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `请求失败（${response.status}）`); return body; }
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) { const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`); for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) }); }

const STOP_WORDS = new Set(["ice","immigration","customs","enforcement","breaking","update","video","watch","exclusive","news","report","reports","美国","移民","海关","执法","消息","视频","现场","最新","据称","报道","表示","一名","一位","一人","事件","关注"]);
const ACTION_GROUPS = [
  ["arrest","arrested","apprehend","custody","detain","detained","逮捕","拘捕","抓捕","被捕","拘留","扣押","带走"],
  ["raid","operation","sweep","突袭","行动","搜查"],
  ["shoot","shot","shooting","gunfire","枪击","开枪","中枪"],
  ["deport","deported","removal","removed","repatriat","遣返","递解","驱逐"],
  ["death","dead","killed","fatal","死亡","身亡","致死"],
  ["charge","charged","indict","sentenc","起诉","指控","判刑"],
  ["release","released","释放","获释"]
];
function normalize(value) { return safeText(value).toLowerCase().replace(/https?:\/\/\S+/g," ").replace(/@[a-z0-9_]+/gi," ").replace(/#([\p{L}\p{N}_]+)/gu,"$1").replace(/[“”‘’'"`]/g,"").replace(/[^\p{L}\p{N}\s]+/gu," ").replace(/\s+/g," ").trim(); }
function tokenSet(value) { const raw = normalize(value).match(/[a-z0-9][a-z0-9'-]{2,}|[\u3400-\u9fff]{2,4}/g) || []; return new Set(raw.filter((token) => !STOP_WORDS.has(token))); }
function ngrams(value,size=3) { const chars=Array.from(normalize(value).replace(/\s+/g,"")); const out=new Set(); if(chars.length<size)return new Set(chars.length?[chars.join("")]:[]); for(let i=0;i<=chars.length-size;i+=1)out.add(chars.slice(i,i+size).join("")); return out; }
function jaccard(left,right){if(!left.size||!right.size)return 0;let common=0;for(const item of left)if(right.has(item))common+=1;return common/new Set([...left,...right]).size;}
function overlap(left,right){if(!left.size||!right.size)return 0;let common=0;for(const item of left)if(right.has(item))common+=1;return common/Math.min(left.size,right.size);}
function similarity(a,b){const at=tokenSet(a),bt=tokenSet(b);return Math.max(jaccard(at,bt),overlap(at,bt)*0.84,jaccard(ngrams(a),ngrams(b)));}
function actionKeys(value){const text=normalize(value);const out=new Set();ACTION_GROUPS.forEach((group,index)=>{if(group.some((term)=>text.includes(term)))out.add(String(index));});return out;}
function numberKeys(value){return new Set((normalize(value).match(/\b\d{1,4}\b/g)||[]).filter((n)=>Number(n)<1900||Number(n)>2100));}
function properKeys(value){const text=safeText(value,15000);const english=text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g)||[];const places=text.match(/[\u3400-\u9fff]{2,10}(?:州|市|县|区|镇|村|拘留中心|监狱|法院|机场|边境|设施|大楼)/g)||[];return new Set([...english,...places].map(normalize).filter(Boolean));}
function combinedArticleText(article){return [article.title,article.summary,article.content].filter(Boolean).join(" ");}
function combinedStoryText(story){return [story.title,story.summary,story.content].filter(Boolean).join(" ");}
function eventFingerprintOfArticle(article){return safeJson(article.metadata,{})?.event_fingerprint||"";}
function postTime(post){return new Date(post.source_created_at||post.created_at||0).getTime();}
function isSimilar(a,b){const left=normalize(a),right=normalize(b);if(!left||!right)return false;if(left===right)return true;if(Math.min(left.length,right.length)>=35&&(left.includes(right)||right.includes(left)))return true;const score=similarity(left,right);const sharedActions=overlap(actionKeys(a),actionKeys(b));const sharedProper=overlap(properKeys(a),properKeys(b));const sharedNumbers=overlap(numberKeys(a),numberKeys(b));return score>=SIMILARITY_THRESHOLD||(sharedActions>0&&sharedProper>0&&score>=0.23)||(sharedProper>0&&sharedNumbers>0&&score>=0.26);}

// Only automatically-produced ICE articles participate in hard duplicate suppression.
// Human/editorial long-form articles are deliberately excluded and must never be killed by this collector rule.
function isAutoIceArticle(article){
  const metadata=safeJson(article.metadata,{});
  const platform=safeText(article.source_platform,100).toLowerCase();
  const review=safeText(article.review_status,100).toLowerCase();
  return platform==="x" || platform==="manual_ice_review" || review==="human_published_override" || Boolean(metadata?.event_fingerprint && (metadata?.manual_override || metadata?.automation || metadata?.ice_auto));
}
async function markSkipped(post,reason,duplicateId=null){const payload=safeJson(post.extraction_payload,{});await sb("ice_posts",{method:"PATCH",query:{id:`eq.${post.id}`},body:{relevant:false,processing_status:"irrelevant",last_error:reason,extraction_payload:{...payload,precollect_dedupe:true,duplicate_reason:reason,duplicate_reference_id:duplicateId,checked_at:nowIso()}},prefer:"return=minimal"});}
async function pendingPosts(){const rows=await sb("ice_posts",{query:{select:"id,x_post_id,source_text,source_type,source_username,source_created_at,created_at,event_fingerprint,event_type,city,state_code,location_text,extraction_payload",processing_status:"in.(collected,processing,extracted,failed)",or:"(relevant.is.null,relevant.eq.true)",order:"source_created_at.desc.nullslast,created_at.desc",limit:String(Number(process.env.ICE_PRECOLLECT_MAX||1200))}});return Array.isArray(rows)?rows:[];}
async function recentStories(){const rows=await sb("ice_stories",{query:{select:"id,event_fingerprint,title,summary,content,last_seen_at,created_at,status",status:"in.(collecting,pending_review,pending_corroboration,approved,published)",last_seen_at:`gte.${cutoffMinutes(RECENT_WINDOW_MINUTES)}`,order:"last_seen_at.desc",limit:"1200"}});return Array.isArray(rows)?rows:[];}
async function publishedArticles(){const rows=await sb("articles",{query:{select:"id,title,summary,content,published_at,source_created_at,metadata,source_post_id,source_platform,review_status",topic_key:"eq.ice",status:"eq.published",published_at:`gte.${cutoffDays(PUBLISHED_LOOKBACK_DAYS)}`,order:"published_at.desc",limit:"2000"}});return (Array.isArray(rows)?rows:[]).filter(isAutoIceArticle);}

async function main(){
  requireEnv();
  const [posts,stories,articles]=await Promise.all([pendingPosts(),recentStories(),publishedArticles()]);
  const oldestAllowed=Date.now()-MAX_SOURCE_AGE_MINUTES*60000;
  let stale=0,recentDuplicate=0,publishedDuplicate=0,passed=0;
  for(const post of posts){
    const raw=safeText(post.source_text);const time=postTime(post);
    if(!Number.isFinite(time)||time<oldestAllowed){await markSkipped(post,"precollect_source_older_than_one_hour");stale+=1;continue;}
    const recent=stories.find((story)=>(post.event_fingerprint&&story.event_fingerprint===post.event_fingerprint)||isSimilar(raw,combinedStoryText(story)));
    if(recent){await markSkipped(post,"precollect_duplicate_of_recent_one_hour_story",recent.id);recentDuplicate+=1;continue;}
    const published=articles.find((article)=>(post.event_fingerprint&&eventFingerprintOfArticle(article)===post.event_fingerprint)||isSimilar(raw,combinedArticleText(article)));
    if(published){
      // Product rule: once an auto-collected ICE event has been published, every later auto-collected
      // related item is killed before review, even when it contains additional details.
      await markSkipped(post,"precollect_duplicate_of_published_auto_ice_hard_kill",published.id);
      publishedDuplicate+=1;continue;
    }
    passed+=1;
  }
  console.log(JSON.stringify({stage:"ice-precollect-published-dedupe-v2",policy:"auto_ice_related_hard_kill_human_longform_preserved",scanned:posts.length,auto_published_comparison_set:articles.length,skipped_stale_over_one_hour:stale,skipped_recent_one_hour_duplicates:recentDuplicate,skipped_published_auto_ice_related:publishedDuplicate,passed_to_intake:passed},null,2));
}
main().catch((error)=>{console.error("ICE采集前已发布内容去重失败：",error);process.exitCode=1;});
