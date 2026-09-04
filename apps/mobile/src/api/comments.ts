import { supabase } from '../auth/supabase';
import { hydrateCommentLikeState } from './comment-like-state';

export type CommentRow = {
  id: string;
  article_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  status: 'published' | 'pending' | 'hidden' | 'deleted';
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  like_count: number;
  viewer_has_liked: boolean;
  profiles?: { display_name?: string; avatar_key?: string } | null;
};

export type CommentCursor = { created_at: string; id: string } | null;
const PAGE_SIZE = 30;

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('请先登录。');
  return data.user.id;
}

export async function listComments(articleId: string, cursor: CommentCursor = null) {
  let query = supabase.from('comments').select('id,article_id,user_id,parent_id,content,status,is_pinned,created_at,updated_at,profiles(display_name,avatar_key),comment_likes(count)').eq('article_id', articleId).eq('status', 'published').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1);
  if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  const [{ data, error }, { data: sessionData }] = await Promise.all([query, supabase.auth.getSession()]);
  if (error) throw error;
  const rows = data || [];
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  let likedCommentIds: string[] = [];
  if (sessionData.session && pageRows.length) {
    const { data: likes, error: likesError } = await supabase.from('comment_likes').select('comment_id').eq('user_id', sessionData.session.user.id).in('comment_id', pageRows.map((row) => row.id));
    if (likesError) throw likesError;
    likedCommentIds = (likes || []).map((like) => like.comment_id);
  }
  const items = hydrateCommentLikeState(pageRows, likedCommentIds) as CommentRow[];
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null };
}

export async function listOwnComments(limit = 100) {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('comments').select('id,article_id,user_id,parent_id,content,status,is_pinned,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, like_count: 0, viewer_has_liked: false })) as CommentRow[];
}

export async function createComment(articleId: string, content: string, parentId: string | null = null) {
  const text = content.trim();
  if (!text || text.length > 3000) throw new Error('评论内容需要在 1–3000 字之间。');
  const userId = await currentUserId();
  const { data, error } = await supabase.from('comments').insert({ article_id: articleId, user_id: userId, parent_id: parentId, content: text }).select('id,article_id,user_id,parent_id,content,status,is_pinned,created_at,updated_at').single();
  if (error) throw error;
  return { ...data, like_count: 0, viewer_has_liked: false } as CommentRow;
}

export async function deleteOwnComment(commentId: string) {
  await currentUserId();
  const { data, error } = await supabase.rpc('delete_own_comment', { p_comment_id: commentId });
  if (error) throw error;
  if (data !== true) throw new Error('评论不存在或不属于当前账号。');
}

export async function likeComment(commentId: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from('comment_likes').upsert({ comment_id: commentId, user_id: userId }, { onConflict: 'comment_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unlikeComment(commentId: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
  if (error) throw error;
}

export async function reportComment(commentId: string, reason: string) {
  const text = reason.trim();
  if (!text || text.length > 500) throw new Error('举报理由需要在 1–500 字之间。');
  const userId = await currentUserId();
  const { error } = await supabase.from('comment_reports').insert({ comment_id: commentId, reporter_user_id: userId, reason: text });
  if (error) throw error;
}
