import { supabase } from '../auth/supabase';
import { createCommunityApi } from './community-core';
import type { CommunityCategory } from './community-core';
export type { CommunityCategory, CommunityComment, CommunityPost, CommunityPostDetail } from './community-core';

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

const api = createCommunityApi({ getAccessToken: accessToken });

export async function listCommunityPosts(offset = 0, limit = 20) {
  return api.listPosts(offset, limit);
}

export async function createCommunityPost(input: {
  category: CommunityCategory;
  content_label: 'personal_experience' | 'question' | 'community_summary' | 'official_policy';
  title: string;
  content: string;
}) {
  return api.createPost(input);
}

export const getCommunityPost = api.getPost;
export const createCommunityComment = api.createComment;
export const unpublishCommunityComment = api.unpublishComment;
export const toggleCommunityPostLike = api.toggleLike;
export const reportCommunityPost = api.reportPost;
export const unpublishCommunityPost = api.unpublishPost;
