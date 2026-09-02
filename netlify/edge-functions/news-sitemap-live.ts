const SITE = "https://trrb.net";
const MIN_INDEXABLE_BODY_LENGTH = 300;
const MIN_INDEXABLE_TITLE_LENGTH = 8;
export const config = { path: "/news-sitemap.xml" };

const FALLBACK: Record<string,string> = {
  "重要新闻":"important-news",
  "热门头条":"hot-headlines",
  "美国时政":"us-politics",
  "美国警情":"us-crime",
  "中国官场":"china-officialdom",
  "移民美国":"immigration",
  "庇护百科":"asylum",
  "驱逐快报":"deport",
  "ICE执法动态":"ice",
  "ICE执法":"ice"
};
const ALIASES: Record<string,string> = {
  important:"important-news",
  hot:"hot-headlines",
  politics:"us-politics",
  crime:"us-crime",
  china:"china-officialdom"
};
const clean=(v:unknown)=>String(v??"").replace(/\s+/g," ").trim();
const canonicalSection=(v:unknown)=>ALIASES[clean(v)]||clean(v);
const visible=(v:unknown)=>clean(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&[a-z0-9#]+;/gi," ").replace(/\s+/g," ").trim();
const normalizedTitle=(v:unknown)=>visible(v).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,"");
const esc=(v:unknown)=>clean(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
function isIceArticle(a:any){const t=clean(a?.topic_key).toLowerCase();const c=clean(a?.category_name);return t==="ice"||c==="ICE执法动态"||c==="ICE执法";}
function isSpecialTopicArticle(a:any){const t=clean(a?.topic_key).toLowerCase();return t==="ice"||t==="trump";}
function cfg(){const base=(Deno.env.get("SUPABASE_URL")||"").replace(/\/+$/,'');const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||"";return{base,key};}
async function rows(path:string,params:Record<string,string>){const{base,key}=cfg();if(!base||!key)throw new Error("Supabase config missing");const u=new URL(`${base}/rest/v1/${path}`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u,{cache:"no-store",headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"}});if(!r.ok)throw new Error(`${path} ${r.status}`);const j=await r.json();return Array.isArray(j)?j:[];}
function section(a:any,byId:Map<string,any>,byName:Map<string,any>){const t=clean(a.topic_key).toLowerCase();if(t==="trump")return"trump";if(t==="ice")return"ice";const byIdSlug=clean(byId.get(String(a.category_id||""))?.slug);if(byIdSlug)return canonicalSection(byIdSlug);const byNameSlug=clean(byName.get(clean(a.category_name))?.slug);if(byNameSlug)return canonicalSection(byNameSlug);return FALLBACK[clean(a.category_name)]||"news";}

export default async(request:Request,context:any)=>{
  if(!["GET","HEAD"].includes(request.method))return context.next();
  try{
    const now=Date.now();
    const cutoff=now-48*60*60*1000;
    const [cats,articles]=await Promise.all([
      rows("categories",{select:"id,name,slug,is_active,include_in_google_news",is_active:"eq.true",limit:"500"}),
      rows("articles",{select:"id,title,slug,summary,content,category_id,category_name,topic_key,status,visibility,published_at,created_at",status:"eq.published",visibility:"eq.public",order:"published_at.desc.nullslast,created_at.desc,id.desc",limit:"1000"})
    ]);
    const ids=new Set(cats.filter((x:any)=>x.include_in_google_news!==false).map((x:any)=>String(x.id)));
    const names=new Set(cats.filter((x:any)=>x.include_in_google_news!==false).map((x:any)=>clean(x.name)));
    const slugs=new Set(cats.filter((x:any)=>x.include_in_google_news!==false).map((x:any)=>canonicalSection(x.slug)));
    const byId=new Map(cats.map((x:any)=>[String(x.id||""),x]));
    const byName=new Map(cats.map((x:any)=>[clean(x.name),x]));
    const recent=articles
      .map((a:any)=>({a,ts:Date.parse(a.published_at||a.created_at||"")}))
      .filter((x:any)=>Number.isFinite(x.ts)&&x.ts>=cutoff&&x.ts<=now+300000&&clean(x.a.title))
      .sort((x:any,y:any)=>y.ts-x.ts);

    const seenTitles=new Set<string>();
    const seenBodies=new Set<string>();
    let excludedDuplicate=0;
    let excludedThin=0;
    let preservedSpecialTopic=0;
    const selected:{a:any;ts:number;loc:string}[]=[];

    for(const {a,ts} of recent){
      if(cats.length&&!isSpecialTopicArticle(a)){
        if(a.category_id&&!ids.has(String(a.category_id)))continue;
        if(!a.category_id&&a.category_name){const name=clean(a.category_name);const fallbackSlug=canonicalSection(FALLBACK[name]||"");if(!names.has(name)&&!(fallbackSlug&&slugs.has(fallbackSlug)))continue;}
      }else if(isSpecialTopicArticle(a)){
        preservedSpecialTopic++;
      }

      const body=visible(a.content||a.summary||"");
      const title=visible(a.title||"");
      if(title.length<MIN_INDEXABLE_TITLE_LENGTH||body.length<MIN_INDEXABLE_BODY_LENGTH){excludedThin++;continue;}

      const titleKey=normalizedTitle(a.title);
      const bodyKey=body.length>=120?body:"";
      if((titleKey.length>=8&&seenTitles.has(titleKey))||(bodyKey&&seenBodies.has(bodyKey))){excludedDuplicate++;continue;}
      if(titleKey.length>=8)seenTitles.add(titleKey);
      if(bodyKey)seenBodies.add(bodyKey);

      const slug=clean(a.slug)||clean(a.id);
      if(!slug)continue;
      const loc=`${SITE}/${encodeURIComponent(section(a,byId,byName))}/${encodeURIComponent(slug)}`;
      selected.push({a,ts,loc});
    }

    const blocks=selected.slice(0,1000).map(({a,ts,loc})=>`  <url>\n    <loc>${esc(loc)}</loc>\n    <news:news>\n      <news:publication><news:name>唐人日报</news:name><news:language>zh-cn</news:language></news:publication>\n      <news:publication_date>${new Date(ts).toISOString()}</news:publication_date>\n      <news:title>${esc(a.title)}</news:title>\n    </news:news>\n  </url>`);

    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
    return new Response(request.method==="HEAD"?null:xml,{status:200,headers:{
      "content-type":"application/xml; charset=UTF-8",
      "cache-control":"public, max-age=30, stale-while-revalidate=60",
      "x-trrb-news-sitemap":"live-supabase-v7-quality-dedupe",
      "x-trrb-news-count":String(blocks.length),
      "x-trrb-news-source-rows":String(articles.length),
      "x-trrb-news-recent-candidates":String(recent.length),
      "x-trrb-news-excluded-thin":String(excludedThin),
      "x-trrb-news-min-body":String(MIN_INDEXABLE_BODY_LENGTH),
      "x-trrb-news-preserved-special-topic":String(preservedSpecialTopic),
      "x-trrb-news-excluded-duplicate":String(excludedDuplicate),
      "x-trrb-news-dedupe-winner":"newest"
    }});
  }catch(e){console.error("live news sitemap failed",e);return context.next();}
};
