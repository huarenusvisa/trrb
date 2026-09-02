import { supabase } from '../auth/supabase';

const COMMUNITY_API = 'https://trrb.net/.netlify/functions/community-api';

export type CommunityCategory =
  | 'hot_discussion'
  | 'immigration_help'
  | 'court_experience'
  | 'uscis_interview'
  | 'ice_experience'
  | 'lawyer_review'
  | 'tipoff';

export type CommunityPost = {
  id: string;
  user_id: string;
  category: CommunityCategory;
  title: string;
  content: string;
  content_label: string;
  status: 'published' | 'pending' | 'deleted';
  like_count: number;
  comment_count: number;
  created_at: string;
  profiles?: { display_name?: string; avatar_key?: string } | null;
};

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function request<T>(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const token = await accessToken();
  const response = await fetch(COMMUNITY_API, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload as T;
}

export async function listCommunityPosts() {
  const data = await request<{ posts: CommunityPost[] }>('GET');
  return data.posts || [];
}

export async function createCommunityPost(input: {
  category: CommunityCategory;
  content_label: 'personal_experience' | 'question' | 'community_summary' | 'official_policy';
  title: string;
  content: string;
}) {
  return request<{ post: CommunityPost; message: string }>('POST', {
    action: 'create_post',
    ...input,
  });
}
