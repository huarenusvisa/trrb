const INTERACTION_TYPES = new Set([
  'comment_reply',
  'comment_like',
  'community_reply',
  'community_post_like',
  'community_comment_like',
  'community_report',
  'follow',
  'follow_request',
  'follow_accept',
  'message_request',
  'message'
]);

const PREFERENCE_FIELD_BY_TYPE = {
  comment_reply: 'comments',
  community_reply: 'comments',
  comment_like: 'likes',
  community_post_like: 'likes',
  community_comment_like: 'likes',
  community_report: 'moderation',
  follow: 'follows',
  follow_request: 'follows',
  follow_accept: 'follows',
  message_request: 'messages',
  message: 'messages'
};

const FALLBACK_TITLES = {
  comment_reply: '有人回复了你的新闻评论',
  comment_like: '有人赞了你的新闻评论',
  community_reply: '有人回复了你的社区评论',
  community_post_like: '有人赞了你的社区帖子',
  community_comment_like: '有人赞了你的社区评论',
  community_report: '你的社区举报有新进展',
  follow: '你有新的关注者',
  follow_request: '你有新的关注申请',
  follow_accept: '你的关注申请已通过',
  message_request: '你收到一条聊天申请',
  message: '你收到一条新私信'
};

function destinationKey(notification) {
  if (notification.conversation_id) return `conversation:${notification.conversation_id}`;
  if (notification.type === 'community_reply' && notification.community_post_id) {
    return `community-post:${notification.community_post_id}`;
  }
  if (notification.type === 'comment_reply' && notification.article_id) {
    return `article:${notification.article_id}`;
  }
  if (notification.community_comment_id) return `community-comment:${notification.community_comment_id}`;
  if (notification.community_post_id) return `community-post:${notification.community_post_id}`;
  if (notification.comment_id) return `comment:${notification.comment_id}`;
  if (notification.article_id) return `article:${notification.article_id}`;
  if (notification.actor_user_id) return `actor:${notification.actor_user_id}`;
  return `notification:${notification.id}`;
}

function notificationFamily(type) {
  return type === 'message' || type === 'message_request' ? 'direct_message' : type;
}

function coalescedTitle(type, count, fallback) {
  if (count < 2) return fallback;
  if (type === 'message') return `你收到 ${count} 条新私信`;
  if (type === 'message_request') return `你收到 ${count} 条聊天申请`;
  if (type === 'follow' || type === 'follow_request') return `你有 ${count} 个新的关注动态`;
  if (type.includes('like')) return `你的内容收到 ${count} 次点赞`;
  if (type.includes('reply')) return `你收到 ${count} 条新回复`;
  return fallback;
}

function collapseNotifications(notifications) {
  const groups = new Map();
  for (const notification of notifications || []) {
    if (!INTERACTION_TYPES.has(notification?.type)) continue;
    const key = `${notification.user_id}:${notificationFamily(notification.type)}:${destinationKey(notification)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(notification);
  }

  const deliver = [];
  const skipped = [];
  for (const group of groups.values()) {
    const latest = group[group.length - 1];
    deliver.push({
      ...latest,
      title: coalescedTitle(latest.type, group.length, latest.title || FALLBACK_TITLES[latest.type]),
      coalesced_count: group.length
    });
    for (const notification of group.slice(0, -1)) {
      skipped.push({ id: notification.id, reason: 'coalesced_into_newer_notification' });
    }
  }
  return { deliver, skipped };
}

function uuidInFilter(values) {
  const ids = [...new Set(values)]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));
  return ids.length ? `in.(${ids.join(',')})` : null;
}

function buildDeliveryPlan(notifications, tokens, preferences) {
  const preferencesByUser = new Map((preferences || []).map((row) => [row.user_id, row]));
  const tokensByUser = new Map();
  for (const token of tokens || []) {
    if (!token?.enabled || !token?.expo_push_token) continue;
    if (!tokensByUser.has(token.user_id)) tokensByUser.set(token.user_id, []);
    tokensByUser.get(token.user_id).push(token);
  }

  const collapsed = collapseNotifications(notifications);
  const targets = [];
  const skipped = [...collapsed.skipped];
  for (const notification of collapsed.deliver) {
    const preferenceField = PREFERENCE_FIELD_BY_TYPE[notification.type];
    const userPreferences = preferencesByUser.get(notification.user_id);
    const explicitPreference = userPreferences?.[preferenceField];
    const legacyCommunityEnabled = preferenceField === 'messages' || userPreferences?.community !== false;
    const enabled = legacyCommunityEnabled && (explicitPreference ?? true);
    if (preferenceField && enabled === false) {
      skipped.push({ id: notification.id, reason: `${preferenceField}_preference_disabled` });
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
          channelId: notification.type.startsWith('message') ? 'messages' : 'community',
          title: notification.title || FALLBACK_TITLES[notification.type],
          body: notification.body || '打开唐人日报查看详情',
          data: {
            type: notification.type,
            ...(notification.coalesced_count > 1 ? { coalesced_count: notification.coalesced_count } : {}),
            ...(notification.actor_user_id ? { actor_user_id: notification.actor_user_id } : {}),
            ...(notification.article_id ? { article_id: notification.article_id } : {}),
            ...(notification.comment_id ? { comment_id: notification.comment_id } : {}),
            ...(notification.community_post_id ? { community_post_id: notification.community_post_id } : {}),
            ...(notification.community_comment_id ? { community_comment_id: notification.community_comment_id } : {}),
            ...(notification.conversation_id ? { conversation_id: notification.conversation_id } : {})
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

module.exports = { INTERACTION_TYPES, PREFERENCE_FIELD_BY_TYPE, buildDeliveryPlan, collapseNotifications, notificationFamily, summarizeNotificationOutcomes, uuidInFilter };
