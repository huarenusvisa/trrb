import { supabase } from '../auth/supabase';

export async function followUser(targetUserId: string) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('需要登录');
  if (userId === targetUserId) throw new Error('不能关注自己');
  const { error } = await supabase.from('user_follows').upsert({ follower_id: userId, following_id: targetUserId });
  if (error) throw error;
}

export async function unfollowUser(targetUserId: string) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('需要登录');
  const { error } = await supabase.from('user_follows').delete().eq('follower_id', userId).eq('following_id', targetUserId);
  if (error) throw error;
}

export async function getFollowCounts(userId: string) {
  const [followers, following] = await Promise.all([
    supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count || 0, following: following.count || 0 };
}
