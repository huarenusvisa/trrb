import { supabase } from '../auth/supabase';

export type PublicProfile = {
  id: string;
  display_name?: string | null;
  avatar_key?: string | null;
  status?: string | null;
};

async function signedInUserId() {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('需要登录');
  return userId;
}

export async function followUser(targetUserId: string) {
  const userId = await signedInUserId();
  if (userId === targetUserId) throw new Error('不能关注自己');
  const { data: target, error: targetError } = await supabase.from('profiles').select('id,status').eq('id', targetUserId).single();
  if (targetError) throw targetError;
  if (!target || target.status !== 'active') throw new Error('该用户当前不可关注');
  const { error } = await supabase.from('user_follows').upsert(
    { follower_user_id: userId, followed_user_id: targetUserId },
    { onConflict: 'follower_user_id,followed_user_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function unfollowUser(targetUserId: string) {
  const userId = await signedInUserId();
  const { error } = await supabase.from('user_follows').delete().eq('follower_user_id', userId).eq('followed_user_id', targetUserId);
  if (error) throw error;
}

export async function isFollowing(targetUserId: string) {
  const userId = await signedInUserId();
  const { data, error } = await supabase.from('user_follows').select('followed_user_id').eq('follower_user_id', userId).eq('followed_user_id', targetUserId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getFollowCounts(userId: string) {
  const [followers, following] = await Promise.all([
    supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('followed_user_id', userId),
    supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_user_id', userId)
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count || 0, following: following.count || 0 };
}

async function loadProfiles(ids: string[]) {
  if (ids.length === 0) return [] as PublicProfile[];
  const { data, error } = await supabase.from('profiles').select('id,display_name,avatar_key,status').in('id', ids).eq('status', 'active');
  if (error) throw error;
  const byId = new Map((data || []).map((row) => [row.id, row as PublicProfile]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as PublicProfile[];
}

export async function listFollowers(userId: string, limit = 100) {
  const { data, error } = await supabase.from('user_follows').select('follower_user_id').eq('followed_user_id', userId).order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return loadProfiles((data || []).map((row) => row.follower_user_id));
}

export async function listFollowing(userId: string, limit = 100) {
  const { data, error } = await supabase.from('user_follows').select('followed_user_id').eq('follower_user_id', userId).order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return loadProfiles((data || []).map((row) => row.followed_user_id));
}
