export type PushPermission = 'granted' | 'denied' | 'undetermined';

const PUSH_RESPONSE_DEDUP_MS = 15_000;
const PUSH_RESPONSE_HISTORY_LIMIT = 40;

export class PushResponseGate {
  private handled = new Map<string, number>();

  claim(identifier: string, now = Date.now()) {
    const normalizedIdentifier = identifier.trim();
    const safeNow = Number.isFinite(now) ? now : Date.now();
    if (!normalizedIdentifier) return false;

    for (const [key, handledAt] of this.handled) {
      if (safeNow - handledAt >= PUSH_RESPONSE_DEDUP_MS || handledAt > safeNow) this.handled.delete(key);
    }
    const previous = this.handled.get(normalizedIdentifier);
    if (previous !== undefined && safeNow - previous < PUSH_RESPONSE_DEDUP_MS) return false;

    this.handled.set(normalizedIdentifier, safeNow);
    while (this.handled.size > PUSH_RESPONSE_HISTORY_LIMIT) {
      const oldest = this.handled.keys().next().value;
      if (oldest === undefined) break;
      this.handled.delete(oldest);
    }
    return true;
  }
}

function notificationId(data: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const id = String(value).trim();
      if (id) return id;
    }
  }
  return null;
}

export function pushTargetPath(data: Record<string, unknown> | undefined) {
  const conversationId = notificationId(data, ['conversation_id', 'conversationId']);
  if (conversationId) return `/chat/${encodeURIComponent(conversationId)}`;

  const articleId = notificationId(data, ['article_id', 'articleId']);
  if (articleId) return `/article/${encodeURIComponent(articleId)}`;

  const postId = notificationId(data, ['post_id', 'postId', 'community_post_id']);
  if (postId) {
    const postPath = `/community/${encodeURIComponent(postId)}`;
    const commentId = notificationId(data, ['comment_id', 'commentId', 'community_comment_id']);
    return commentId ? `${postPath}?commentId=${encodeURIComponent(commentId)}` : postPath;
  }

  const type = data?.type;
  if (type === 'message' || type === 'message_request') return '/messages';
  if (typeof type === 'string' && ['comment_reply', 'comment_like', 'post_reply', 'system'].includes(type)) {
    return '/notifications';
  }
  return null;
}

export function pushDestination(data: Record<string, unknown> | undefined) {
  return pushTargetPath(data) ?? '/notifications?pushTarget=unavailable';
}

export function shouldRequestPushPermission(status: PushPermission, explicitlyRequested: boolean) {
  return status !== 'granted' && explicitlyRequested;
}
