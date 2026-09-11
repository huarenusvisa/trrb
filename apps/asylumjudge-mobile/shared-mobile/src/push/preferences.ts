import { supabase } from '../auth/supabase';

export type PushPreferences = {
  breaking_news: boolean;
  ice: boolean;
  immigration: boolean;
  legal: boolean;
  community: boolean;
  comments: boolean;
  likes: boolean;
  follows: boolean;
  messages: boolean;
  moderation: boolean;
};

export async function getPushPreferences(): Promise<PushPreferences> {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('需要登录');
  const row = await supabase.from('notification_preferences').select('breaking_news,ice,immigration,legal,community,comments,likes,follows,messages,moderation').eq('user_id', data.user.id).maybeSingle();
  if (row.error) throw row.error;
  return {
    breaking_news: row.data?.breaking_news ?? true,
    ice: row.data?.ice ?? true,
    immigration: row.data?.immigration ?? true,
    legal: row.data?.legal ?? true,
    community: row.data?.community ?? true,
    comments: row.data?.comments ?? row.data?.community ?? true,
    likes: row.data?.likes ?? row.data?.community ?? true,
    follows: row.data?.follows ?? row.data?.community ?? true,
    messages: row.data?.messages ?? true,
    moderation: row.data?.moderation ?? row.data?.community ?? true
  };
}

export async function updatePushPreferences(patch: Partial<PushPreferences>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('需要登录');
  const result = await supabase.from('notification_preferences').upsert({ user_id: data.user.id, ...patch });
  if (result.error) throw result.error;
}
