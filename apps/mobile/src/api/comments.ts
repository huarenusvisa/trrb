import { supabase } from '../auth/supabase';

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
  profiles?: { display_name?: string; avatar_key?: string } | null;
};

export type CommentCursor = { created_at: string; id: string } | null;

const PAGE_SIZE = 30;

export async function listComments(articleId: string, cursor: CommentCursor = null) {
  let query = supabase
    .from('comments')
    .select('id,article_id,user_id,parent_id,content,status,is_pinned,created_at,updated_at,profiles(display_name,avatar_key)')
    .eq('article_id', articleId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as unknown as CommentRow[];
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null
  };
}

export async function createComment(articleId: string, content: string, parentId: string | null = null) {
  const text = content.trim();
  if (!text || text.length > 3000) throw new Error('评论内容需要在 1–3000 字之间。');
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) throw new Error('请先登录后再评论。');

  const { data, error } = await supabase
    .from('comments')
    .insert({ article_id: articleId, user_id: user.id, parent_id: parentId, content: text })
    .select('id,article_id,user_id,parent_id,content,status,is_pinned,created_at,updated_at')
    .single();
  if (error) throw error;
  return data as CommentRow;
}

export async function deleteOwnComment(commentId: string) {
  const { error } = await supabase.from('comments').update({ status: 'deleted', content: '[已删除]' }).eq('id', commentId);
  if (error) throw error;
}
