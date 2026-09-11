import { supabase } from '../auth/supabase';
import { currentUserId } from './profiles';

export async function isUserBlocked(targetUserId: string) {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('user_blocks').select('blocked_user_id').eq('blocker_user_id', userId).eq('blocked_user_id', targetUserId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function blockUser(targetUserId: string) {
  const userId = await currentUserId();
  if (userId === targetUserId) throw new Error('不能拉黑自己');
  const { error } = await supabase.from('user_blocks').insert({ blocker_user_id: userId, blocked_user_id: targetUserId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(targetUserId: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_user_id', userId).eq('blocked_user_id', targetUserId);
  if (error) throw error;
}
