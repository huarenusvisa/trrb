const INTERACTION_TYPES = new Set([
  'community_reply',
  'community_post_like',
  'community_comment_like',
  'community_report'
]);

const FALLBACK_TITLES = {
  community_reply: '有人回复了你的社区评论',
  community_post_like: '有人赞了你的社区帖子',
  community_comment_like: '有人赞了你的社区评论',
  community_report: '你的社区举报有新进展'
};

function uuidInFilter(values) {
  const ids = [...new Set(values)]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));
  return ids.length ? `in.(${ids.join(',')})` : null;
}

function buildDeliveryPlan(notifications, tokens, preferences) {
  const allowed = new Map((preferences || []).map((row) => [row.user_id, row.community !== false]));
  const tokensByUser = new Map();
  for (const token of tokens || []) {
    if (!token?.enabled || !token?.expo_push_token) continue;
    if (!tokensByUser.has(token.user_id)) tokensByUser.set(token.user_id, []);
    tokensByUser.get(token.user_id).push(token);
  }

  const targets = [];
  const skipped = [];
  for (const notification of notifications || []) {
    if (!INTERACTION_TYPES.has(notification?.type)) continue;
    if (allowed.get(notification.user_id) === false) {
      skipped.push({ id: notification.id, reason: 'community_preference_disabled' });
      continue;
    }
    const recipientTokens = tokensByUser.get(notification.user_id) || [];
    if (!recipientTokens.length) {
      skipped.push({ id: notification.id, reason: 'no_active_push_token' });
      continue;
    }
    for (const token of recipientTokens) {
      targets.push({
        id: token.id,
        notification_id: notification.id,
        message: {
          to: token.expo_push_token,
          sound: 'default',
          channelId: 'community',
          title: notification.title || FALLBACK_TITLES[notification.type],
          body: notification.body || '打开唐人日报查看详情',
          data: {
            type: notification.type,
            community_post_id: notification.community_post_id,
            ...(notification.community_comment_id
              ? { community_comment_id: notification.community_comment_id }
              : {})
          }
        }
      });
    }
  }
  return { targets, skipped };
}

function summarizeNotificationOutcomes(targets, tickets) {
  const summaries = new Map();
  targets.forEach((target, index) => {
    if (!summaries.has(target.notification_id)) {
      summaries.set(target.notification_id, { id: target.notification_id, accepted: 0, rejected: 0 });
    }
    const summary = summaries.get(target.notification_id);
    const ticket = tickets[index];
    if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.trim()) summary.accepted += 1;
    else summary.rejected += 1;
  });
  return [...summaries.values()];
}

module.exports = { INTERACTION_TYPES, buildDeliveryPlan, summarizeNotificationOutcomes, uuidInFilter };
