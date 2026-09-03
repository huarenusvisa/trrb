export type PushPermission = 'granted' | 'denied' | 'undetermined';

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
  const articleId = notificationId(data, ['article_id', 'articleId']);
  if (articleId) return `/article/${encodeURIComponent(articleId)}`;

  const postId = notificationId(data, ['post_id', 'postId', 'community_post_id']);
  if (postId) return `/community/${encodeURIComponent(postId)}`;

  const type = data?.type;
  if (typeof type === 'string' && ['comment_reply', 'comment_like', 'post_reply', 'system'].includes(type)) {
    return '/notifications';
  }
  return null;
}

export function shouldRequestPushPermission(status: PushPermission, explicitlyRequested: boolean) {
  return status !== 'granted' && explicitlyRequested;
}
