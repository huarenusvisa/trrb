import fs from 'node:fs';

function replaceOrFail(text, from, to, label){
  if(!text.includes(from)) throw new Error(`patch marker missing: ${label}`);
  return text.replace(from,to);
}

// 1) Public live endpoint: support exact category filtering, preserving published_at DESC.
{
  const path='netlify/functions/public-home-articles.js';
  let s=fs.readFileSync(path,'utf8');
  s=replaceOrFail(s,
`    const requested = Number(event.queryStringParameters?.limit || 120);\n    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 120, 20), 200);\n    const rows = await rest("articles", {\n      query: {\n        select: "id,title,slug,summary,content,category_name,cover_image,author,status,published_at,created_at",\n        status: "eq.published",\n        order: "published_at.desc.nullslast,created_at.desc",\n        limit: String(limit)\n      }\n    });`,
`    const requested = Number(event.queryStringParameters?.limit || 120);\n    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 120, 1), 200);\n    const category = String(event.queryStringParameters?.category || "").trim().slice(0, 80);\n    const query = {\n      select: "id,title,slug,summary,content,category_name,cover_image,author,status,published_at,created_at",\n      status: "eq.published",\n      order: "published_at.desc.nullslast,created_at.desc",\n      limit: String(limit)\n    };\n    if (category) query.category_name = "eq." + category;\n    const rows = await rest("articles", { query });`,
'public category filter');
  fs.writeFileSync(path,s);
}

// 2) Listing page: category pages use exact live category query, never merge archive into normal rendering,
// and always sort by true publication timestamp before pagination.
{
  const path='listing.js';
  let s=fs.readFileSync(path,'utf8');
  const oldFetch=`async function fetchLivePublishedArticles(limit = 60) {\n  const cacheKey = \`trrb-live-v5-\${limit}\`;\n  const cached = readLiveCache(cacheKey);\n  if (cached) return cached;\n  const select = ["id","title","slug","summary","content","category_id","category_name","topic_key","cover_image","author","status","published_at","created_at"].join(",");\n  const url = \`\${TRRB_SUPABASE_URL}/rest/v1/articles?select=\${encodeURIComponent(select)}&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=\${limit}\`;\n  const rows = await fetchJsonWithTimeout(url, {\n    cache: "default",\n    headers: { apikey: TRRB_SUPABASE_KEY, Authorization: \`Bearer \${TRRB_SUPABASE_KEY}\`, Accept: "application/json" }\n  });\n  const articles = (Array.isArray(rows) ? rows : []).map(mapLiveArticle);\n  writeLiveCache(cacheKey, articles);\n  return articles;\n}`;
  const newFetch=`async function fetchLivePublishedArticles(limit = 60, category = "") {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), 6500);\n  try {\n    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit)||60,1),200)), _: String(Date.now()) });\n    if (category) params.set("category", category);\n    const response = await fetch(\`/.netlify/functions/public-home-articles?\${params.toString()}\`, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });\n    if (!response.ok) throw new Error(\`栏目实时接口 \${response.status}\`);\n    const payload = await response.json();\n    const rows = Array.isArray(payload?.articles) ? payload.articles : [];\n    return rows.map(mapLiveArticle).sort((a,b) => articleTimestamp(b)-articleTimestamp(a));\n  } finally { clearTimeout(timer); }\n}\n\nfunction articleTimestamp(item) {\n  const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";\n  const t = new Date(raw).getTime();\n  return Number.isFinite(t) ? t : 0;\n}`;
  s=replaceOrFail(s,oldFetch,newFetch,'listing live fetch');
  s=replaceOrFail(s,
`    body: content ? content.split(/\\n{2,}|\\r?\\n/).map(v => v.trim()).filter(Boolean) : [],\n    isLive: true`,
`    body: content ? content.split(/\\n{2,}|\\r?\\n/).map(v => v.trim()).filter(Boolean) : [],\n    published_at: row.published_at || "",\n    created_at: row.created_at || "",\n    isLive: true`,
'listing timestamps');
  s=replaceOrFail(s,
`  const archived = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : [];`,
`  const archived = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : []; // disaster-recovery only`,
'listing archive marker');
  s=replaceOrFail(s,
`  if (archived.length) renderListingDataset(archived, category, query, page);\n  else renderHeader(category, query);`,
`  renderHeader(category, query);`,
'listing initial archive render');
  s=replaceOrFail(s,
`    const live = searchMode && query\n      ? await fetchLiveSearchArticles(query, 240)\n      : await fetchLivePublishedArticles(100);\n    if (!live.length) {\n      if (!archived.length) renderArticles([], page);\n      return;\n    }\n    const seen = new Set(live.map((item) => String(item.id)));\n    renderListingDataset(live.concat(archived.filter((item) => !seen.has(String(item.id)))), category, query, page);`,
`    const live = searchMode && query\n      ? await fetchLiveSearchArticles(query, 240)\n      : await fetchLivePublishedArticles(200, category);\n    if (!live.length) {\n      renderArticles([], page);\n      return;\n    }\n    renderListingDataset(live, category, query, page);`,
'listing live-only render');
  s=replaceOrFail(s,
`  } catch (error) {\n    console.warn("Live articles unavailable", error);\n    if (!archived.length) renderArticles([], page);\n  }`,
`  } catch (error) {\n    console.warn("Live articles unavailable", error);\n    // Never silently repopulate a normal category page with stale archive rows.\n    renderArticles([], page);\n  }`,
'listing error fallback');
  s=replaceOrFail(s,
`  return articles.filter((article) => {\n    const categoryMatch = !category || article.category === category;\n    const queryMatch = !normalizedQuery || [article.title, article.excerpt, article.category, article.date].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);\n    return categoryMatch && queryMatch;\n  });`,
`  return articles.filter((article) => {\n    const categoryMatch = !category || article.category === category;\n    const queryMatch = !normalizedQuery || [article.title, article.excerpt, article.category, article.date].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);\n    return categoryMatch && queryMatch;\n  }).sort((a,b) => articleTimestamp(b)-articleTimestamp(a));`,
'listing final sort');
  fs.writeFileSync(path,s);
}

// 3) Homepage: supplement the global feed with exact per-category live queries, so lower-volume
// categories such as 庇护百科 are not starved merely because they fall outside the global top 200.
{
  const path='articles-home.js';
  let s=fs.readFileSync(path,'utf8');
  s=replaceOrFail(s,
`async function fetchLivePublishedArticles(limit = 60) {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), 6500);\n  try {\n    const url = \`/.netlify/functions/public-home-articles?limit=\${Math.min(Math.max(Number(limit)||60,20),200)}&_\${Date.now()}\`;`,
`async function fetchLivePublishedArticles(limit = 60, category = "") {\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), 6500);\n  try {\n    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit)||60,1),200)), _: String(Date.now()) });\n    if (category) params.set("category", category);\n    const url = \`/.netlify/functions/public-home-articles?\${params.toString()}\`;`,
'home category fetch');
  s=replaceOrFail(s,
`    const live = await fetchLivePublishedArticles(200);\n    if (!live.length) throw new Error("首页实时接口没有返回已发布新闻");\n    renderHome(live);`,
`    const live = await fetchLivePublishedArticles(200);\n    if (!live.length) throw new Error("首页实时接口没有返回已发布新闻");\n    const coreCategories = ["重要新闻","热门头条","美国时政","美国警情","中国官场","庇护百科"];\n    const supplements = await Promise.all(coreCategories.map((name) => fetchLivePublishedArticles(12, name).catch(() => [])));\n    const seen = new Set();\n    const combined = [...live, ...supplements.flat()]\n      .filter((item) => { const key=String(item?.id||""); if(!key||seen.has(key)) return false; seen.add(key); return true; })\n      .sort((a,b) => articleTimestamp(b)-articleTimestamp(a));\n    renderHome(combined);`,
'home category supplements');
  fs.writeFileSync(path,s);
}

console.log('CATEGORY_LIVE_ONLY=true');
console.log('CATEGORY_SORT=published_at_desc');
console.log('ASYLUM_CATEGORY_SUPPLEMENT=true');
