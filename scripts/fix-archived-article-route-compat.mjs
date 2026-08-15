import fs from 'node:fs';

const file='netlify/edge-functions/article-prerender.ts';
let text=fs.readFileSync(file,'utf8');

const legacyOld=`      const article = await getArticleById(id);\n      if (!article) {\n        return new Response(notFoundHtml(), {\n          status: 404,\n          headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=60", "x-robots-tag": "noindex" }\n        });\n      }\n      const canonical = await canonicalFor(article);`;
const legacyNew=`      const article = await getArticleById(id);\n      // Static/WordPress archive IDs are not stored in Supabase. Let the original\n      // article.html + article.js archive loader handle those instead of returning\n      // a false 404 from the Edge layer.\n      if (!article) return context.next();\n      const canonical = await canonicalFor(article);`;
if(!text.includes(legacyOld) && !text.includes(legacyNew)) throw new Error('legacy article block not found');
text=text.replace(legacyOld,legacyNew);

const prettyOld=`    let article = await getArticleBySlug(parts.slug);\n    if (!article && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(parts.slug)) article = await getArticleById(parts.slug);\n    if (!article) return context.next();`;
const prettyNew=`    let article = await getArticleBySlug(parts.slug);\n    if (!article && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(parts.slug)) article = await getArticleById(parts.slug);\n    // Earlier clients fabricated pretty URLs from archive ids, e.g.\n    // /important-news/117302. Preserve those inbound links by returning them to\n    // the legacy archive loader, which owns numeric and wp-* static article ids.\n    if (!article && /^(?:wp-)?\\d+$/i.test(parts.slug)) {\n      const legacy = new URL('/article.html', url.origin);\n      legacy.searchParams.set('id', parts.slug);\n      return redirect(legacy.toString(), 'archived-id-to-legacy');\n    }\n    if (!article) return context.next();`;
if(!text.includes(prettyOld) && !text.includes(prettyNew)) throw new Error('pretty article block not found');
text=text.replace(prettyOld,prettyNew);

fs.writeFileSync(file,text);
console.log('ARCHIVED_ARTICLE_ROUTE_COMPAT_PATCHED=true');
