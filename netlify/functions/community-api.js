const {
  SUPABASE_URL,
  SERVICE_KEY,
  authenticateUser,
  requestJson,
  rest,
  safeText
} = require('./_shared/supabase-admin');

const CATEGORIES = new Set([
  'hot_discussion','immigration_help','court_experience','uscis_interview',
  'ice_experience','lawyer_review','tipoff'
]);
const LABELS = new Set(['official_policy','personal_experience','community_summary','question']);
const HIGH_REVIEW = new Set(['lawyer_review','tipoff']);
const BLOCKED = [
  /儿童色情|未成年.{0,8}(?:色情|性交易)/i,
  /买卖.{0,8}(?:毒品|枪支)|雇凶|人口贩卖/i
];
const REVIEW = [
  /诈骗|骗钱|黑律师|无证律师|伪造|行贿|受贿|威胁|报复|性骚扰|强奸/i,
  /A\s*[-#]?\s*\d{7,9}/i,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/
];

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS'
  },
  body: JSON.stringify(body)
});

function clean(value, max) {
  return safeText(value, max).replace(/[<>]/g, '');
}

function authHeader(event) {
  return safeText(event.headers.authorization || event.headers.Authorization, 4000);
}

async function optionalUser(event) {
  if (!authHeader(event)) return null;
  try { return (await authenticateUser(event)).user; }
  catch { return null; }
}

async function ensureProfile(user) {
  const rows = await rest('profiles', {
    query: { select: 'id,display_name,avatar_key,status', id: `eq.${user.id}`, limit: '1' }
  });
  let profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) {
    const suffix = String(user.id).replaceAll('-', '').slice(0, 8);
    const created = await rest('profiles', {
      method: 'POST',
      body: {
        id: user.id,
        display_name: `唐人用户${suffix}`,
        avatar_key: `initial_${suffix.slice(0, 1).toUpperCase()}`
      },
      prefer: 'return=representation'
    });
    profile = Array.isArray(created) ? created[0] : null;
  }
  if (!profile || profile.status !== 'active') {
    const error = new Error('当前账号暂不能参与社区互动');
    error.statusCode = 403;
    throw error;
  }
  return profile;
}

function moderation(category, title, content) {
  const combined = `${title}\n${content}`;
  if (BLOCKED.some((rule) => rule.test(combined))) {
    const error = new Error('内容涉及违法或未成年人高风险信息，不能提交');
    error.statusCode = 422;
    throw error;
  }
  const flags = [];
  if (HIGH_REVIEW.has(category)) flags.push('category_manual_review');
  if (REVIEW.some((rule) => rule.test(combined))) flags.push('sensitive_claim_or_private_data');
  if ((combined.match(/https?:\/\//gi) || []).length > 2) flags.push('link_flood');
  const pending = flags.length > 0;
  return {
    status: pending ? 'pending' : 'published',
    moderation_state: pending ? 'manual_review' : 'rules_passed',
    risk_level: pending ? (HIGH_REVIEW.has(category) ? 'high' : 'medium') : 'low',
    risk_flags: flags,
    is_indexable: false,
    published_at: pending ? null : new Date().toISOString()
  };
}

function withViewerLikeState(posts, likeRows = []) {
  const likedPostIds = new Set((likeRows || []).map((row) => row.post_id));
  return (posts || []).map((post) => ({ ...post, viewer_has_liked: likedPostIds.has(post.id) }));
}

function resolveLikeMutation(currentLiked, currentCount, desiredLiked) {
  const liked = typeof desiredLiked === 'boolean' ? desiredLiked : !currentLiked;
  const changed = liked !== currentLiked;
  return {
    liked,
    changed,
    like_count: Math.max(0, Number(currentCount || 0) + (changed ? (liked ? 1 : -1) : 0))
  };
}

async function feed(event) {
  const user = await optionalUser(event);
  const category = clean(event.queryStringParameters?.category, 50);
  const postId = clean(event.queryStringParameters?.post_id, 80);
  const query = {
    select: 'id,user_id,category,title,content,content_label,location_state,location_city,agency_office,case_type,event_date,outcome,judge_name,judge_slug,lawyer_or_firm,status,moderation_state,risk_level,is_indexable,like_count,comment_count,published_at,created_at,updated_at,profiles!community_posts_user_id_fkey(display_name,avatar_key)',
    order: 'created_at.desc',
    limit: postId ? '1' : '80'
  };
  if (postId) query.id = `eq.${postId}`;
  else if (category && CATEGORIES.has(category)) query.category = `eq.${category}`;
  const rows = await rest('community_posts', { query });
  let posts = (rows || []).filter((row) => row.status === 'published' || (user && row.user_id === user.id && row.status !== 'deleted'));
  let viewerLikes = [];
  if (user && posts.length) {
    viewerLikes = await rest('community_post_likes', {
      query: {
        select: 'post_id',
        user_id: `eq.${user.id}`,
        post_id: `in.(${posts.map((post) => post.id).join(',')})`,
        limit: String(posts.length)
      }
    });
  }
  posts = withViewerLikeState(posts, viewerLikes);
  let comments = [];
  if (postId && posts.length) {
    const commentRows = await rest('community_post_comments', {
      query: {
        select: 'id,post_id,user_id,parent_id,content,status,risk_level,created_at,profiles!community_post_comments_user_id_fkey(display_name,avatar_key)',
        post_id: `eq.${postId}`,
        order: 'created_at.asc',
        limit: '300'
      }
    });
    comments = (commentRows || []).filter((row) => row.status === 'published' || (user && row.user_id === user.id && row.status !== 'deleted'));
  }
  return json(200, { ok: true, posts, comments, viewer_user_id: user?.id || null });
}

async function createPost(event, user, profile, body) {
  const category = clean(body.category, 50);
  const title = clean(body.title, 120);
  const content = clean(body.content, 12000);
  const contentLabel = LABELS.has(body.content_label) ? body.content_label : 'personal_experience';
  if (!CATEGORIES.has(category)) return json(400, { error: '请选择有效板块' });
  if (title.length < 4) return json(400, { error: '标题至少需要 4 个字' });
  if (content.length < 20) return json(400, { error: '正文至少需要 20 个字' });

  const recent = await rest('community_posts', {
    query: {
      select: 'id', user_id: `eq.${user.id}`,
      created_at: `gte.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`,
      limit: '6'
    }
  });
  if ((recent || []).length >= 5) return json(429, { error: '发布太频繁，请稍后再试' });

  const review = moderation(category, title, content);
  const payload = {
    user_id: user.id,
    category,
    title,
    content,
    content_label: contentLabel,
    location_state: clean(body.location_state, 40) || null,
    location_city: clean(body.location_city, 120) || null,
    agency_office: clean(body.agency_office, 180) || null,
    case_type: clean(body.case_type, 100) || null,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.event_date || '')) ? body.event_date : null,
    outcome: clean(body.outcome, 80) || null,
    judge_name: clean(body.judge_name, 180) || null,
    judge_slug: clean(body.judge_slug, 220) || null,
    lawyer_or_firm: clean(body.lawyer_or_firm, 220) || null,
    ...review
  };
  const rows = await rest('community_posts', { method: 'POST', body: payload, prefer: 'return=representation' });
  return json(201, {
    ok: true,
    post: Array.isArray(rows) ? rows[0] : null,
    profile,
    message: review.status === 'published' ? '发布成功' : '已提交，进入人工审核'
  });
}

async function createComment(user, body) {
  const postId = clean(body.post_id, 80);
  const content = clean(body.content, 3000);
  if (!postId || content.length < 1) return json(400, { error: '评论不能为空' });
  moderation('immigration_help', '评论', content);
  const posts = await rest('community_posts', { query: { select: 'id,category,status,comment_count', id: `eq.${postId}`, limit: '1' } });
  const post = Array.isArray(posts) ? posts[0] : null;
  if (!post || post.status !== 'published') return json(404, { error: '帖子不可评论' });
  let parentId = clean(body.parent_id, 80) || null;
  if (parentId) {
    const parents = await rest('community_post_comments', { query: { select: 'id,post_id,status', id: `eq.${parentId}`, limit: '1' } });
    const parent = Array.isArray(parents) ? parents[0] : null;
    if (!parent || parent.post_id !== postId || parent.status !== 'published') return json(400, { error: '回复对象无效' });
  }
  const needsReview = HIGH_REVIEW.has(post.category) || REVIEW.some((rule) => rule.test(content));
  const rows = await rest('community_post_comments', {
    method: 'POST',
    body: {
      post_id: postId,
      user_id: user.id,
      parent_id: parentId,
      content,
      status: needsReview ? 'pending' : 'published',
      risk_level: needsReview ? 'medium' : 'low'
    },
    prefer: 'return=representation'
  });
  if (!needsReview) {
    await rest('community_posts', {
      method: 'PATCH', query: { id: `eq.${postId}` },
      body: { comment_count: Number(post.comment_count || 0) + 1, updated_at: new Date().toISOString() },
      prefer: 'return=minimal'
    });
  }
  return json(201, { ok: true, comment: Array.isArray(rows) ? rows[0] : null, pending: needsReview });
}

function commentCountAfterUnpublish(comment, currentCount) {
  return comment?.status === 'published' ? Math.max(0, Number(currentCount || 0) - 1) : Math.max(0, Number(currentCount || 0));
}

async function unpublishComment(user, body) {
  const commentId = clean(body.comment_id, 80);
  if (!commentId) return json(400, { error: '评论编号无效' });
  const rows = await rest('community_post_comments', {
    query: { select: 'id,post_id,user_id,status', id: `eq.${commentId}`, limit: '1' }
  });
  const comment = Array.isArray(rows) ? rows[0] : null;
  if (!comment || comment.user_id !== user.id) return json(404, { error: '评论不存在或无权操作' });
  const posts = await rest('community_posts', {
    query: { select: 'id,comment_count', id: `eq.${comment.post_id}`, limit: '1' }
  });
  const post = Array.isArray(posts) ? posts[0] : null;
  if (!post) return json(404, { error: '评论所属帖子不存在' });
  const nextCount = commentCountAfterUnpublish(comment, post.comment_count);
  if (comment.status !== 'deleted') {
    await rest('community_post_comments', {
      method: 'PATCH', query: { id: `eq.${commentId}`, user_id: `eq.${user.id}` },
      body: { status: 'deleted', updated_at: new Date().toISOString() }, prefer: 'return=minimal'
    });
    if (nextCount !== Number(post.comment_count || 0)) {
      await rest('community_posts', {
        method: 'PATCH', query: { id: `eq.${comment.post_id}` },
        body: { comment_count: nextCount, updated_at: new Date().toISOString() }, prefer: 'return=minimal'
      });
    }
  }
  return json(200, { ok: true, comment_id: commentId, comment_count: nextCount });
}

async function toggleLike(user, body) {
  const postId = clean(body.post_id, 80);
  const posts = await rest('community_posts', { query: { select: 'id,status,like_count', id: `eq.${postId}`, limit: '1' } });
  const post = Array.isArray(posts) ? posts[0] : null;
  if (!post || post.status !== 'published') return json(404, { error: '帖子不存在' });
  const found = await rest('community_post_likes', { query: { select: 'post_id', post_id: `eq.${postId}`, user_id: `eq.${user.id}`, limit: '1' } });
  const currentLiked = (found || []).length > 0;
  const mutation = resolveLikeMutation(currentLiked, post.like_count, body.liked);
  if (currentLiked && mutation.changed) {
    await rest('community_post_likes', { method: 'DELETE', query: { post_id: `eq.${postId}`, user_id: `eq.${user.id}` }, prefer: 'return=minimal' });
  } else if (!currentLiked && mutation.changed) {
    await rest('community_post_likes', { method: 'POST', body: { post_id: postId, user_id: user.id }, prefer: 'return=minimal' });
  }
  if (mutation.changed) {
    await rest('community_posts', { method: 'PATCH', query: { id: `eq.${postId}` }, body: { like_count: mutation.like_count }, prefer: 'return=minimal' });
  }
  return json(200, { ok: true, liked: mutation.liked, like_count: mutation.like_count });
}

async function reportPost(user, body) {
  const postId = clean(body.post_id, 80);
  const reason = clean(body.reason, 500);
  if (!postId || reason.length < 2) return json(400, { error: '请填写举报理由' });
  await rest('community_post_reports', {
    method: 'POST', body: { post_id: postId, reporter_user_id: user.id, reason }, prefer: 'resolution=ignore-duplicates,return=minimal'
  });
  return json(201, { ok: true });
}

async function unpublishPost(user, body) {
  const postId = clean(body.post_id, 80);
  const rows = await rest('community_posts', { query: { select: 'id,user_id,status', id: `eq.${postId}`, limit: '1' } });
  const post = Array.isArray(rows) ? rows[0] : null;
  if (!post || post.user_id !== user.id) return json(404, { error: '帖子不存在或无权操作' });
  await rest('community_posts', {
    method: 'PATCH', query: { id: `eq.${postId}` },
    body: { status: 'deleted', is_indexable: false, updated_at: new Date().toISOString() }, prefer: 'return=minimal'
  });
  return json(200, { ok: true });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    if (!SUPABASE_URL || !SERVICE_KEY) return json(503, { error: '社区数据服务暂不可用' });
    if (event.httpMethod === 'GET') return feed(event);
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
    const { user } = await authenticateUser(event);
    const profile = await ensureProfile(user);
    const body = JSON.parse(event.body || '{}');
    const action = clean(body.action, 60);
    if (action === 'create_post') return createPost(event, user, profile, body);
    if (action === 'create_comment') return createComment(user, body);
    if (action === 'unpublish_comment') return unpublishComment(user, body);
    if (action === 'toggle_like') return toggleLike(user, body);
    if (action === 'report_post') return reportPost(user, body);
    if (action === 'unpublish_post') return unpublishPost(user, body);
    return json(400, { error: 'unknown_action' });
  } catch (error) {
    console.error('Community API error:', error);
    return json(error.statusCode || 500, { error: error.message || '社区服务出错' });
  }
};

exports._test = { moderation, clean, commentCountAfterUnpublish, withViewerLikeState, resolveLikeMutation };
