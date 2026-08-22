const { handler: baseHandler } = require('./ice-review-v2');
const { buildPeopleCountMetadata } = require('./_shared/ice-people-count');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://fwiznbpsqkfgkvyznebz.supabase.co').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function safeText(value, max = 30000) {
  return String(value ?? '').trim().replace(/\u0000/g, '').slice(0, max);
}

function parseMetadata(value) {
  if (value && typeof value === 'object') return value;
  try { return typeof value === 'string' ? JSON.parse(value) : {}; } catch { return {}; }
}

async function getArticle(id) {
  if (!SERVICE_KEY) throw new Error('Netlify尚未设置SUPABASE_SERVICE_ROLE_KEY');
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set('id', `eq.${id}`);
  url.searchParams.set('select', 'title,summary,content,metadata');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.message || data?.details || data?.raw || `Supabase ${response.status}`);
  return Array.isArray(data) ? data[0] || null : data;
}

async function patch(table, id, body) {
  if (!SERVICE_KEY) throw new Error('Netlify尚未设置SUPABASE_SERVICE_ROLE_KEY');
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('id', `eq.${id}`);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.message || data?.details || data?.raw || `Supabase ${response.status}`);
  return Array.isArray(data) ? data[0] : data;
}

exports.handler = async (event, context) => {
  const base = await baseHandler(event, context);
  if (base.statusCode < 200 || base.statusCode >= 300) return base;

  let input = {};
  let result = {};
  try { input = JSON.parse(event.body || '{}'); } catch {}
  try { result = JSON.parse(base.body || '{}'); } catch {}

  if (safeText(input.action, 60) !== 'publish_now') return base;

  const storyId = safeText(input.story_id, 100);
  const articleId = safeText(result.article_id, 100);
  const title = safeText(input.title, 220);
  const summary = safeText(input.summary, 1200);
  const content = safeText(input.content, 30000);
  const coverImage = safeText(input.cover_image, 3000);
  const notes = safeText(input.notes, 4000);
  const now = new Date().toISOString();

  // Important: ice-review-v2 intentionally returns early when a story already has article_id.
  // That used to discard edits made in the review modal. V3 makes the submitted editor fields
  // authoritative and persists them to BOTH the public article and the review story.
  if (articleId) {
    const existing = await getArticle(articleId);
    const finalTitle = title || safeText(existing?.title, 220);
    const finalSummary = summary || safeText(existing?.summary, 1200);
    const finalContent = content || safeText(existing?.content, 30000);
    const metadata = parseMetadata(existing?.metadata);
    const peopleMetadata = buildPeopleCountMetadata({
      title: finalTitle,
      summary: finalSummary,
      content: finalContent,
      event_type: metadata.event_type || ''
    });
    await patch('articles', articleId, {
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
      ...(content ? { content } : {}),
      cover_image: coverImage,
      metadata: { ...metadata, ...peopleMetadata },
      status: 'published',
      updated_at: now
    });
  }

  if (storyId) {
    await patch('ice_stories', storyId, {
      ...(title ? { title, final_title: title } : {}),
      ...(summary ? { summary, final_summary: summary } : {}),
      ...(content ? { content, final_content: content } : {}),
      cover_image: coverImage,
      final_cover_image: coverImage,
      editor_notes: notes,
      status: 'published',
      human_review_status: 'approved',
      ...(articleId ? { article_id: articleId } : {}),
      reviewed_at: now,
      updated_at: now
    });
  }

  return {
    ...base,
    headers: { ...(base.headers || {}), 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    body: JSON.stringify({ ...result, editorial_persisted: true })
  };
};
