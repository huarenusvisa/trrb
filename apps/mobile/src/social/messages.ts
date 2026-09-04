import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../auth/supabase';
import { currentUserId, loadSocialProfile, loadSocialProfiles } from './profiles';
import type { ConversationSummary, DirectConversation, DirectMessage } from './types';

const CONVERSATION_SELECT = 'id,requester_user_id,recipient_user_id,status,accepted_at,last_message_at,created_at,updated_at';
const MESSAGE_SELECT = 'id,conversation_id,sender_user_id,body,read_at,created_at';

export async function listConversations() {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('direct_conversations').select(CONVERSATION_SELECT)
    .or(`requester_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  const conversations = (data || []) as DirectConversation[];
  const partnerIds = conversations.map((row) => row.requester_user_id === userId ? row.recipient_user_id : row.requester_user_id);
  const profiles = await loadSocialProfiles(partnerIds);
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  if (!conversations.length) return [] as ConversationSummary[];
  const ids = conversations.map((row) => row.id);
  const { data: messages, error: messageError } = await supabase.from('direct_messages').select(MESSAGE_SELECT).in('conversation_id', ids).order('created_at', { ascending: false }).limit(500);
  if (messageError) throw messageError;
  const latest = new Map<string, DirectMessage>();
  const unread = new Map<string, number>();
  for (const row of (messages || []) as DirectMessage[]) {
    if (!latest.has(row.conversation_id)) latest.set(row.conversation_id, row);
    if (row.sender_user_id !== userId && !row.read_at) unread.set(row.conversation_id, (unread.get(row.conversation_id) || 0) + 1);
  }
  return conversations.map((row) => {
    const partnerId = row.requester_user_id === userId ? row.recipient_user_id : row.requester_user_id;
    return { ...row, partner: profileMap.get(partnerId) || null, latest_message: latest.get(row.id) || null, unread_count: unread.get(row.id) || 0 };
  });
}

export async function getConversation(conversationId: string) {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('direct_conversations').select(CONVERSATION_SELECT).eq('id', conversationId).single();
  if (error) throw error;
  const conversation = data as DirectConversation;
  const partnerId = conversation.requester_user_id === userId ? conversation.recipient_user_id : conversation.requester_user_id;
  const partner = await loadSocialProfile(partnerId);
  return { conversation, partner, userId };
}

export async function findConversationWith(targetUserId: string) {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('direct_conversations').select(CONVERSATION_SELECT)
    .or(`and(requester_user_id.eq.${userId},recipient_user_id.eq.${targetUserId}),and(requester_user_id.eq.${targetUserId},recipient_user_id.eq.${userId})`)
    .maybeSingle();
  if (error) throw error;
  return data as DirectConversation | null;
}

export async function listMessages(conversationId: string) {
  const { data, error } = await supabase.from('direct_messages').select(MESSAGE_SELECT).eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500);
  if (error) throw error;
  return (data || []) as DirectMessage[];
}

export async function createMessageRequest(targetUserId: string, body: string) {
  const userId = await currentUserId();
  const clean = body.trim();
  if (!clean || clean.length > 2000) throw new Error('消息需要在 1–2000 字之间。');
  let conversation = await findConversationWith(targetUserId);
  if (!conversation) {
    const { data, error } = await supabase.from('direct_conversations').insert({ requester_user_id: userId, recipient_user_id: targetUserId }).select(CONVERSATION_SELECT).single();
    if (error && error.code !== '23505') throw error;
    conversation = data as DirectConversation | null;
    if (!conversation) conversation = await findConversationWith(targetUserId);
  }
  if (!conversation) throw new Error('无法创建聊天申请。');
  await sendMessage(conversation.id, clean);
  return conversation;
}

export async function sendMessage(conversationId: string, body: string) {
  const userId = await currentUserId();
  const clean = body.trim();
  if (!clean || clean.length > 2000) throw new Error('消息需要在 1–2000 字之间。');
  const { data, error } = await supabase.from('direct_messages').insert({ conversation_id: conversationId, sender_user_id: userId, body: clean }).select(MESSAGE_SELECT).single();
  if (error) {
    if (error.message.includes('waiting_for_chat_confirmation')) throw new Error('对方确认聊天前，你不能再发送第二条消息。');
    if (error.message.includes('confirm_chat_before_reply')) throw new Error('请先点击“确认聊天”，再回复消息。');
    throw error;
  }
  return data as DirectMessage;
}

export async function answerMessageRequest(conversationId: string, accept: boolean) {
  const { error } = await supabase.from('direct_conversations').update({ status: accept ? 'accepted' : 'declined' }).eq('id', conversationId).eq('status', 'pending');
  if (error) throw error;
}

export async function markConversationRead(conversationId: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', conversationId).neq('sender_user_id', userId).is('read_at', null);
  if (error) throw error;
}

export async function unreadDirectMessageCount() {
  const userId = await currentUserId();
  const { data: conversations, error } = await supabase.from('direct_conversations').select('id').or(`requester_user_id.eq.${userId},recipient_user_id.eq.${userId}`);
  if (error) throw error;
  const ids = (conversations || []).map((row) => row.id);
  if (!ids.length) return 0;
  const { count, error: countError } = await supabase.from('direct_messages').select('*', { count: 'exact', head: true }).in('conversation_id', ids).neq('sender_user_id', userId).is('read_at', null);
  if (countError) throw countError;
  return count || 0;
}

export function subscribeToConversation(conversationId: string, onChange: () => void): RealtimeChannel {
  return supabase.channel(`direct-conversation:${conversationId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_conversations', filter: `id=eq.${conversationId}` }, onChange)
    .subscribe();
}
