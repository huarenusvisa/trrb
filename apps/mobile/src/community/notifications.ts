import { supabase } from '../auth/supabase';

export type NotificationType = 'comment_reply' | 'comment_like' | 'follow' | 'follow_request' | 'follow_accept' | 'message_request' | 'message' | 'system';

export type UserNotification = {
  id: string;
  user_id: string;
  actor_user_id?: string | null;
  type: NotificationType;
  title?: string | null;
  body?: string | null;
  article_id?: string | null;
  comment_id?: string | null;
  is_read: boolean;
  created_at: string;
};

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('需要登录');
  return data.user.id;
}

export async function listNotifications(limit = 50) {
  const userId = await currentUserId();
  const result = await supabase
    .from('user_notifications')
    .select('id,user_id,actor_user_id,type,title,body,article_id,comment_id,is_read,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (result.error) throw result.error;
  return (result.data || []) as UserNotification[];
}

export async function markNotificationRead(id: string) {
  const userId = await currentUserId();
  const result = await supabase.from('user_notifications').update({ is_read: true }).eq('id', id).eq('user_id', userId);
  if (result.error) throw result.error;
}

export async function markAllNotificationsRead() {
  const userId = await currentUserId();
  const result = await supabase.from('user_notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (result.error) throw result.error;
}

export async function unreadNotificationCount() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) return 0;
  const result = await supabase.from('user_notifications').select('*', { count: 'exact', head: true }).eq('user_id', data.user.id).eq('is_read', false);
  if (result.error) throw result.error;
  return result.count || 0;
}

export function notificationTarget(item: UserNotification) {
  if (item.type === 'message' || item.type === 'message_request') return '/messages';
  if (item.type === 'follow_request') return '/follow-requests';
  if (item.article_id) return `/article/${encodeURIComponent(item.article_id)}`;
  if (item.actor_user_id) return `/user/${encodeURIComponent(item.actor_user_id)}`;
  return null;
}

export function notificationLabel(type: NotificationType) {
  switch (type) {
    case 'comment_reply': return '有人回复了你';
    case 'comment_like': return '有人赞了你的评论';
    case 'follow': return '你有新的关注者';
    case 'follow_request': return '你有新的关注申请';
    case 'follow_accept': return '你的关注申请已通过';
    case 'message_request': return '你收到一条聊天申请';
    case 'message': return '你收到一条新私信';
    default: return '系统通知';
  }
}
