import { supabase } from '../auth/supabase';
import { currentUserId, loadSocialProfiles } from '../social/profiles';
import type { FollowStatus, SocialProfile } from '../social/types';

export type PublicProfile = SocialProfile;

export async function followUser(targetUserId: string) {
  const userId = await currentUserId();
  if (userId === targetUserId) throw new Error('不能关注自己');
  const { data, error } = await supabase.from('user_follows').insert({ follower_user_id: userId, followed_user_id: targetUserId }).select('status').single();
  if (error && error.code !== '23505') throw error;
  if (data?.status) return data.status as Exclude<FollowStatus, 'none'>;
  return followStatus(targetUserId) as Promise<Exclude<FollowStatus, 'none'>>;
}

export async function unfollowUser(targetUserId: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from('user_follows').delete().eq('follower_user_id', userId).eq('followed_user_id', targetUserId);
  if (error) throw error;
}

export async function removeFollower(followerUserId: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from('user_follows').delete().eq('follower_user_id', followerUserId).eq('followed_user_id', userId);
  if (error) throw error;
}

export async function followStatus(targetUserId: string): Promise<FollowStatus> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('user_follows').select('status').eq('follower_user_id', userId).eq('followed_user_id', targetUserId).maybeSingle();
  if (error) throw error;
  return (data?.status as FollowStatus | undefined) || 'none';
}

export async function isFollowing(targetUserId: string) { return (await followStatus(targetUserId)) === 'accepted'; }

export async function getFollowCounts(userId: string) {
  const [followers, following] = await Promise.all([
    supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('followed_user_id', userId).eq('status', 'accepted'),
    supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_user_id', userId).eq('status', 'accepted'),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count || 0, following: following.count || 0 };
}

export async function listFollowers(userId: string, limit = 100) {
  const { data, error } = await supabase.from('user_follows').select('follower_user_id').eq('followed_user_id', userId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return loadSocialProfiles((data || []).map((row) => row.follower_user_id));
}

export async function listFollowing(userId: string, limit = 100) {
  const { data, error } = await supabase.from('user_follows').select('followed_user_id').eq('follower_user_id', userId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return loadSocialProfiles((data || []).map((row) => row.followed_user_id));
}

export async function listFollowRequests() {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('user_follows').select('follower_user_id,created_at').eq('followed_user_id', userId).eq('status', 'pending').order('created_at', { ascending: false });
  if (error) throw error;
  const profiles = await loadSocialProfiles((data || []).map((row) => row.follower_user_id));
  const created = new Map((data || []).map((row) => [row.follower_user_id, row.created_at]));
  return profiles.map((profile) => ({ profile, created_at: created.get(profile.id) as string }));
}

export async function answerFollowRequest(followerUserId: string, accept: boolean) {
  const userId = await currentUserId();
  const { error } = accept
    ? await supabase.from('user_follows').update({ status: 'accepted' }).eq('follower_user_id', followerUserId).eq('followed_user_id', userId).eq('status', 'pending')
    : await supabase.from('user_follows').delete().eq('follower_user_id', followerUserId).eq('followed_user_id', userId).eq('status', 'pending');
  if (error) throw error;
}
