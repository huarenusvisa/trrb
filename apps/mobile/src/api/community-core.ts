export const COMMUNITY_API_URL = 'https://trrb.net/.netlify/functions/community-api';

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
  status: 'published' | 'pending' | 'hidden' | 'deleted';
  like_count: number;
  comment_count: number;
  created_at: string;
  profiles?: { display_name?: string; avatar_key?: string } | null;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  status: 'published' | 'pending' | 'hidden' | 'deleted';
  risk_level: string;
  created_at: string;
  profiles?: { display_name?: string; avatar_key?: string } | null;
};

export type CommunityPostDetail = {
  post: CommunityPost;
  comments: CommunityComment[];
  viewerUserId: string | null;
};

type FetchLike = typeof fetch;
type ApiDependencies = {
  fetchImpl?: FetchLike;
  getAccessToken: () => Promise<string>;
  baseUrl?: string;
  timeoutMs?: number;
};

export function createCommunityApi({
  fetchImpl = fetch,
  getAccessToken,
  baseUrl = COMMUNITY_API_URL,
  timeoutMs = 15_000,
}: ApiDependencies) {
  async function request<T>(method: 'GET' | 'POST', body?: Record<string, unknown>, query = '') {
    const token = await getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${query}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
      return payload as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('社区请求超时，请检查网络后重试。');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function listPosts() {
    const data = await request<{ posts: CommunityPost[] }>('GET');
    return data.posts || [];
  }

  async function getPost(postId: string): Promise<CommunityPostDetail> {
    const id = postId.trim();
    if (!id) throw new Error('帖子编号无效。');
    const data = await request<{ posts?: CommunityPost[]; comments?: CommunityComment[]; viewer_user_id?: string | null }>(
      'GET', undefined, `?post_id=${encodeURIComponent(id)}`,
    );
    const post = data.posts?.[0];
    if (!post) throw new Error('帖子不存在、仍在审核或已经下架。');
    return { post, comments: data.comments || [], viewerUserId: data.viewer_user_id || null };
  }

  async function createPost(input: {
    category: CommunityCategory;
    content_label: 'personal_experience' | 'question' | 'community_summary' | 'official_policy';
    title: string;
    content: string;
  }) {
    return request<{ post: CommunityPost; message: string }>('POST', { action: 'create_post', ...input });
  }

  async function createComment(postId: string, content: string, parentId: string | null = null) {
    const text = content.trim();
    if (!text || text.length > 3000) throw new Error('评论内容需要在 1–3000 字之间。');
    return request<{ comment: CommunityComment; pending: boolean }>('POST', {
      action: 'create_comment', post_id: postId, content: text, parent_id: parentId,
    });
  }

  async function unpublishComment(commentId: string) {
    const id = commentId.trim();
    if (!id) throw new Error('评论编号无效。');
    return request<{ ok: true; comment_id: string; comment_count: number }>('POST', {
      action: 'unpublish_comment', comment_id: id,
    });
  }

  async function toggleLike(postId: string) {
    return request<{ liked: boolean; like_count: number }>('POST', { action: 'toggle_like', post_id: postId });
  }

  async function reportPost(postId: string, reason: string) {
    const text = reason.trim();
    if (text.length < 2 || text.length > 500) throw new Error('举报理由需要在 2–500 字之间。');
    return request<{ ok: true }>('POST', { action: 'report_post', post_id: postId, reason: text });
  }

  async function unpublishPost(postId: string) {
    return request<{ ok: true }>('POST', { action: 'unpublish_post', post_id: postId });
  }

  return { listPosts, getPost, createPost, createComment, unpublishComment, toggleLike, reportPost, unpublishPost };
}
