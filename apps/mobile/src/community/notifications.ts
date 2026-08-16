import { supabase } from '../auth/supabase';

export type UserNotification = {
  id: string;
  type: 'reply' | 'like' | 'follow' | 'system';
  title?: string | null;
  body?: string | null;
  article_id?: string | null;
  actor_user_id?: string | null;
  is_read: boolean;
  created_at: string;
};

export async function listNotifications(limit = 50) {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('需要登录');
  const result = await supabase.from('user_notifications').select('*').eq('user_id', data.user.id).order('created_at', { ascending: false }).limit(limit);
  if (result.error) throw result.error;
  return (result.data || []) as UserNotification[];
}

export async function markNotificationRead(id: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('需要登录');
  const result = await supabase.from('user_notifications').update({ is_read: true }).eq('id', id).eq('user_id', data.user.id);
  if (result.error) throw result.error;
}

export async function unreadNotificationCount() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) return 0;
  const result = await supabase.from('user_notifications').select('*', { count: 'exact', head: true }).eq('user_id', data.user.id).eq('is_read', false);
  if (result.error) throw result.error;
  return result.count || 0;
}
