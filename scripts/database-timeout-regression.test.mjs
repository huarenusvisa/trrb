import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261009035000_fix_admin_publish_and_automation_timeouts.sql','utf8');

test('production timeout paths have matching database indexes',()=>{
 assert.match(migration,/trrb_normalized_news_title\(title\)/);
 assert.match(migration,/articles_public_category_published_idx/);
 assert.match(migration,/category_name, published_at desc nulls last/);
 assert.match(migration,/ice_stories[\s\S]*published_at desc[\s\S]*where status = 'published'/i);
 assert.match(migration,/admin_users[\s\S]*user_id[\s\S]*is_active = true/i);
 assert.match(migration,/content extensions\.gin_trgm_ops/);
});

test('automation and admin startup avoid known database and cache pressure multipliers',()=>{
 const depth=readFileSync('scripts/news-daily-depth.mjs','utf8');
 assert.doesNotMatch(depth,/supabase\('ice_stories',\{query:\{select:'\*',status:'eq\.published'/);
 const admin=readFileSync('admin/admin.js','utf8');
 assert.doesNotMatch(admin,/caches\.delete|registration\.unregister|await Promise\.allSettled/);
 const prerender=readFileSync('netlify/edge-functions/article-prerender.ts','utf8');
 assert.doesNotMatch(prerender,/Promise\.all\(\[templateResponse\(request\), sectionStories\(/);
});

test('admin and public search continue through the same complete article reader',()=>{
 const admin=readFileSync('netlify/functions/admin-articles.js','utf8');
 const publicSearch=readFileSync('netlify/functions/public-article-search.ts','utf8');
 assert.match(admin,/listManagedArticles\(input,rest\)/);
 assert.match(publicSearch,/reader\.readArticleList\(input,\{publicOnly:true\},rest\)/);
});
