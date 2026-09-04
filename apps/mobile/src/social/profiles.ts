import { supabase } from '../auth/supabase';
import type { SocialProfile } from './types';

export const PROFILE_SELECT = 'id,display_name,avatar_key,avatar_path,cover_path,bio,status,is_private,allow_message_requests';

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('需要登录');
  return id;
}

export async function loadSocialProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single();
  if (error) throw error;
  if (!data || data.status !== 'active') throw new Error('该用户当前不可访问');
  return data as SocialProfile;
}

export async function loadSocialProfiles(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [] as SocialProfile[];
  const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).in('id', ids).eq('status', 'active');
  if (error) throw error;
  const map = new Map((data || []).map((profile) => [profile.id, profile as SocialProfile]));
  return ids.map((id) => map.get(id)).filter(Boolean) as SocialProfile[];
}
