import { supabase } from '../auth/supabase';
import { notificationTypesForCategory, type NotificationCategory, type NotificationType } from './notification-core';

export { notificationCategories, notificationCategoryLabel, notificationLabel, notificationTarget } from './notification-core';
export type { NotificationCategory, NotificationType } from './notification-core';

export type UserNotification = {
  id: string;
  user_id: string;
  actor_user_id?: string | null;
  type: NotificationType;
  title?: string | null;
  body?: string | null;
  article_id?: string | null;
  comment_id?: string | null;
  community_post_id?: string | null;
  community_comment_id?: string | null;
  conversation_id?: string | null;
  is_read: boolean;
  created_at: string;
};

export async function notificationViewerId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('需要登录');
  return data.user.id;
}

export type NotificationPage = { notifications: UserNotification[]; nextOffset: number | null };

export async function listNotifications(offset = 0, limit = 20, category: NotificationCategory = 'all'): Promise<NotificationPage> {
  const userId = await notificationViewerId();
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 50) : 20;
  const query = supabase
    .from('user_notifications')
    .select('id,user_id,actor_user_id,type,title,body,article_id,comment_id,community_post_id,community_comment_id,conversation_id,is_read,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit);
  const types = notificationTypesForCategory(category);
  const result = types ? await query.in('type', types) : await query;
  if (result.error) throw result.error;
  const rows = (result.data || []) as UserNotification[];
  const notifications = rows.slice(0, safeLimit);
  return { notifications, nextOffset: rows.length > safeLimit ? safeOffset + notifications.length : null };
}

export async function markNotificationRead(id: string) {
  const userId = await notificationViewerId();
  const result = await supabase.from('user_notifications').update({ is_read: true }).eq('id', id).eq('user_id', userId);
  if (result.error) throw result.error;
}

export async function markAllNotificationsRead(category: NotificationCategory = 'all') {
  const userId = await notificationViewerId();
  const query = supabase.from('user_notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  const types = notificationTypesForCategory(category);
  const result = types ? await query.in('type', types) : await query;
  if (result.error) throw result.error;
}

export async function unreadNotificationCount() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) return 0;
  const result = await supabase.from('user_notifications').select('*', { count: 'exact', head: true }).eq('user_id', data.user.id).eq('is_read', false);
  if (result.error) throw result.error;
  return result.count || 0;
}
