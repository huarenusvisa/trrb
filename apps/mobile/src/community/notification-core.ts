export type NotificationType =
  | 'comment_reply'
  | 'comment_like'
  | 'community_reply'
  | 'community_post_like'
  | 'community_comment_like'
  | 'community_report'
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'message_request'
  | 'message'
  | 'system';

export type NotificationTarget = {
  type: NotificationType;
  actor_user_id?: string | null;
  article_id?: string | null;
  comment_id?: string | null;
  community_post_id?: string | null;
  community_comment_id?: string | null;
};

export function notificationTarget(item: NotificationTarget) {
  if (item.type === 'message' || item.type === 'message_request') return '/messages';
  if (item.type === 'follow_request') return '/follow-requests';
  if (item.community_post_id) {
    const postPath = `/community/${encodeURIComponent(item.community_post_id)}`;
    return item.community_comment_id
      ? `${postPath}?commentId=${encodeURIComponent(item.community_comment_id)}`
      : postPath;
  }
  if (item.article_id) return `/article/${encodeURIComponent(item.article_id)}`;
  if (item.actor_user_id) return `/user/${encodeURIComponent(item.actor_user_id)}`;
  return null;
}

export function notificationLabel(type: NotificationType) {
  switch (type) {
    case 'comment_reply': return '有人回复了你';
    case 'comment_like': return '有人赞了你的评论';
    case 'community_reply': return '有人回复了你的社区评论';
    case 'community_post_like': return '有人赞了你的社区帖子';
    case 'community_comment_like': return '有人赞了你的社区评论';
    case 'community_report': return '你的社区举报有新进展';
    case 'follow': return '你有新的关注者';
    case 'follow_request': return '你有新的关注申请';
    case 'follow_accept': return '你的关注申请已通过';
    case 'message_request': return '你收到一条聊天申请';
    case 'message': return '你收到一条新私信';
    default: return '系统通知';
  }
}
