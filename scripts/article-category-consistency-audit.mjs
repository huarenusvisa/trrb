const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };

async function rows(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

const categories = await rows('categories', { select: 'id,name,slug', limit: '500' });
const categoryById = new Map(categories.map((category) => [String(category.id || ''), category]));
const articles = [];
for (let offset = 0; offset < 100000; offset += 1000) {
  const page = await rows('articles', {
    select: 'id,title,category_id,category_name,topic_key,status,published_at',
    status: 'eq.published',
    order: 'published_at.asc.nullslast,created_at.asc',
    limit: '1000',
    offset: String(offset)
  });
  articles.push(...page);
  if (page.length < 1000) break;
}

const missingCategoryIds = [];
const mismatches = [];
for (const article of articles) {
  const categoryId = String(article.category_id || '').trim();
  if (!categoryId) continue;
  const category = categoryById.get(categoryId);
  if (!category) {
    missingCategoryIds.push({ id: article.id, title: article.title, category_id: categoryId, category_name: article.category_name });
    continue;
  }
  if (String(article.category_name || '').trim() !== String(category.name || '').trim()) {
    mismatches.push({
      id: article.id,
      title: article.title,
      category_id: categoryId,
      category_id_name: category.name,
      category_name: article.category_name,
      topic_key: article.topic_key
    });
  }
}

console.log(`ARTICLE CATEGORY CONSISTENCY: published=${articles.length}; categories=${categories.length}; missingCategoryIds=${missingCategoryIds.length}; mismatches=${mismatches.length}`);
if (missingCategoryIds.length) console.error('Missing category IDs:', JSON.stringify(missingCategoryIds.slice(0, 20), null, 2));
if (mismatches.length) console.error('Category ID/name mismatches:', JSON.stringify(mismatches.slice(0, 20), null, 2));
if (missingCategoryIds.length || mismatches.length) process.exit(1);
console.log('ARTICLE CATEGORY CONSISTENCY: PASS');
