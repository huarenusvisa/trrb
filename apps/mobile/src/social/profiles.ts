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

function safeProfileSearchQuery(value: string) {
  return value.trim().replace(/[%_]/g, '').replace(/\s+/g, ' ');
}

export async function searchSocialProfiles(query: string, excludeUserId?: string | null, limit = 30) {
  const normalized = safeProfileSearchQuery(query);
  if (Array.from(normalized).length < 2) return [] as SocialProfile[];
  let request = supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('status', 'active')
    .not('display_name', 'is', null)
    .ilike('display_name', `%${normalized}%`)
    .order('display_name', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (excludeUserId) request = request.neq('id', excludeUserId);
  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as SocialProfile[];
}

export async function listDiscoverableProfiles(excludeUserId?: string | null, limit = 20) {
  let request = supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('status', 'active')
    .not('display_name', 'is', null)
    .order('display_name', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 30));
  if (excludeUserId) request = request.neq('id', excludeUserId);
  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as SocialProfile[];
}
