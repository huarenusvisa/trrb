const { safeText, rest, authenticateStaff } = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

function nowIso() { return new Date().toISOString(); }
function chinese(value) { return /[\u3400-\u9fff]/u.test(String(value || '')); }
function bodyLength(value) { return Array.from(String(value || '').replace(/\s+/g, '')).length; }
function assertEditorialReady(story, fields) {
  const payload = story.ai_payload && typeof story.ai_payload === 'object' ? story.ai_payload : {};
  const min = Number(payload.target_min_chars || (Number(payload.source_character_count || 0) >= 300 ? 500 : 300));
  const max = Number(payload.target_max_chars || (min === 500 ? 800 : 360));
  const count = bodyLength(fields.content);
  if (!chinese(fields.title) || !chinese(fields.content)) { const error = new Error('标题和正文必须是中文，禁止直接发布英文原文'); error.statusCode = 400; throw error; }
  if (count < min || count > max) { const error = new Error(`正文当前${count}字，必须达到${min}-${max}字后才能批准发布`); error.statusCode = 400; throw error; }
  if (payload.appears_old_news === true) { const error = new Error('系统识别为旧闻，不能批准发布'); error.statusCode = 400; throw error; }
}

async function getStory(id) {
  const rows = await rest('ice_stories', { query: { select: '*', id: `eq.${safeText(id, 80)}`, limit: '1' } });
  const story = Array.isArray(rows) ? rows[0] : null;
  if (!story) {
    const error = new Error('没有找到这条ICE候选新闻');
    error.statusCode = 404;
    throw error;
  }
  return story;
}

async function storyDetail(id) {
  const story = await getStory(id);
  const [evidence, posts, logs] = await Promise.all([
    rest('ice_story_evidence', { query: { select: '*', story_id: `eq.${story.id}`, order: 'created_at.asc', limit: '100' } }),
    rest('ice_posts', {
      query: {
        select: 'id,x_post_id,x_url,source_username,source_display_name,source_type,trust_tier,independence_key,source_created_at,source_text,media,claims,entities,extraction_confidence,extraction_payload',
        event_fingerprint: `eq.${story.event_fingerprint}`,
        order: 'trust_tier.asc,source_created_at.asc',
        limit: '100'
      }
    }),
    rest('ice_review_logs', { query: { select: '*', story_id: `eq.${story.id}`, order: 'created_at.desc', limit: '50' } })
  ]);
  return { story, evidence: evidence || [], posts: posts || [], logs: logs || [] };
}

function editedFields(input, story) {
  return {
    title: safeText(input.title || story.title, 220),
    summary: safeText(input.summary || story.summary, 1200),
    content: safeText(input.content || story.content, 30000),
    coverImage: safeText(input.cover_image || story.cover_image, 3000)
  };
}

async function patchStory(id, patch) {
  const rows = await rest('ice_stories', {
    method: 'PATCH',
    query: { id: `eq.${id}` },
    body: { ...patch, updated_at: nowIso() },
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function logReview({ story, actor, action, toStatus, notes, changes = {} }) {
  await rest('ice_review_logs', {
    method: 'POST',
    body: {
      story_id: story.id,
      reviewer_user_id: actor.user.id,
      reviewer_email: actor.user.email || actor.admin.email || '',
      action,
      from_status: story.status,
      to_status: toStatus,
      notes: safeText(notes, 4000),
      changes
    },
    prefer: 'return=minimal'
  });
}

async function saveEditorial(story, actor, input) {
  const fields = editedFields(input, story);
  if (!fields.title || !fields.content) throw new Error('标题和正文不能为空');
  const updated = await patchStory(story.id, {
    title: fields.title,
    summary: fields.summary,
    content: fields.content,
    cover_image: fields.coverImage,
    final_title: fields.title,
    final_summary: fields.summary,
    final_content: fields.content,
    final_cover_image: fields.coverImage,
    editor_notes: safeText(input.notes, 4000),
    human_review_status: 'editing',
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || '',
    reviewed_at: nowIso()
  });
  await logReview({ story, actor, action: 'save_editorial', toStatus: updated.status, notes: input.notes, changes: { manual_review: true } });
  return updated;
}

function roundToNextHalfHour(date) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  if (d.getUTCMinutes() < 30) d.setUTCMinutes(30);
  else { d.setUTCHours(d.getUTCHours() + 1); d.setUTCMinutes(0); }
  return d;
}

async function defaultSchedule() {
  const rows = await rest('ice_stories', {
    query: { select: 'scheduled_at', status: 'eq.approved', scheduled_at: 'not.is.null', order: 'scheduled_at.desc', limit: '1' }
  });
  let candidate = new Date();
  const latest = Array.isArray(rows) ? rows[0] : null;
  if (latest?.scheduled_at) {
    const next = new Date(new Date(latest.scheduled_at).getTime() + 120 * 60 * 1000);
    if (next > candidate) candidate = next;
  }
  return roundToNextHalfHour(candidate).toISOString();
}

async function approveStory(story, actor, input) {
  const fields = editedFields(input, story);
  if (!fields.title || !fields.content) throw new Error('标题和正文不能为空');
  assertEditorialReady(story, fields);

  let scheduledAt = safeText(input.scheduled_at, 80);
  if (scheduledAt) {
    const parsed = new Date(scheduledAt);
    if (Number.isNaN(parsed.getTime())) throw new Error('排期时间格式不正确');
    scheduledAt = (parsed < new Date() ? roundToNextHalfHour(new Date()) : parsed).toISOString();
  } else {
    scheduledAt = await defaultSchedule();
  }

  // Human review is the final editorial authority. Automated score/source/risk
  // signals remain visible in the review UI and audit log, but they do not add
  // a second server-side confirmation after the editor has confirmed once.
  const updated = await patchStory(story.id, {
    title: fields.title,
    summary: fields.summary,
    content: fields.content,
    cover_image: fields.coverImage,
    final_title: fields.title,
    final_summary: fields.summary,
    final_content: fields.content,
    final_cover_image: fields.coverImage,
    status: 'approved',
    human_review_status: 'approved',
    scheduled_at: scheduledAt,
    editor_notes: safeText(input.notes, 4000),
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || '',
    reviewed_at: nowIso()
  });
  await logReview({
    story, actor, action: 'approve_schedule', toStatus: 'approved', notes: input.notes,
    changes: {
      scheduled_at: scheduledAt,
      manual_override: true,
      total_score: story.total_score,
      ai_confidence: story.ai_confidence,
      independent_source_count: story.independent_source_count,
      official_source_count: story.official_source_count,
      conflict_detected: Boolean(story.conflict_detected),
      legal_risk: Boolean(story.legal_risk),
      privacy_risk: Boolean(story.privacy_risk),
      fabrication_risk: Boolean(story.fabrication_risk)
    }
  });
  return updated;
}

async function simpleDecision(story, actor, input, action) {
  const notes = safeText(input.notes, 4000);
  const common = {
    editor_notes: notes,
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || '',
    reviewed_at: nowIso(),
    scheduled_at: null
  };
  let patch;
  let toStatus;
  if (action === 'wait') {
    toStatus = 'pending_corroboration';
    patch = { ...common, status: toStatus, human_review_status: 'waiting' };
  } else if (action === 'rewrite') {
    toStatus = 'pending_review';
    patch = { ...common, status: toStatus, human_review_status: 'rewrite_requested' };
  } else if (action === 'reject') {
    if (!notes) throw new Error('拒绝发布时必须填写审核理由');
    toStatus = 'rejected';
    patch = { ...common, status: toStatus, human_review_status: 'rejected' };
  } else {
    throw new Error('未知审核动作');
  }
  const updated = await patchStory(story.id, patch);
  await logReview({ story, actor, action, toStatus, notes });
  return updated;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const actor = await authenticateStaff(event, ['owner', 'editor']);
    const input = JSON.parse(event.body || '{}');
    const action = safeText(input.action, 60);
    if (action === 'detail') return json(200, await storyDetail(safeText(input.story_id, 80)));
    const story = await getStory(safeText(input.story_id, 80));
    if (action === 'save') return json(200, { story: await saveEditorial(story, actor, input) });
    if (action === 'approve') return json(200, { story: await approveStory(story, actor, input) });
    if (['wait', 'rewrite', 'reject'].includes(action)) return json(200, { story: await simpleDecision(story, actor, input, action) });
    return json(400, { error: '该动作不由v4处理器处理' });
  } catch (error) {
    console.error('ICE review actions v4 error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
