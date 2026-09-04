import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/auth/supabase';
import { followStatus, followUser, getFollowCounts, unfollowUser } from '../../src/community/follows';
import { ProfileHero } from '../../src/components/ProfileHero';
import { ProfilePostList } from '../../src/components/ProfilePostList';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { blockUser, isUserBlocked, unblockUser } from '../../src/social/blocks';
import { findConversationWith } from '../../src/social/messages';
import { listProfilePosts } from '../../src/social/posts';
import { loadSocialProfile } from '../../src/social/profiles';
import type { FollowStatus, ProfilePost, SocialProfile } from '../../src/social/types';
import { withUiTimeout } from '../../src/utils/async-state-core';

type ActionFeedback = { title: string; message: string; tone: 'neutral' | 'error'; retry?: () => void };

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id || '');
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [relation, setRelation] = useState<FollowStatus>('none');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await withUiTimeout((async () => {
        const { data: auth } = await supabase.auth.getUser();
        const current = auth.user?.id || null;
        if (current === userId) return { redirect: true } as const;
        const blockedByMe = current ? await isUserBlocked(userId) : false;
        if (blockedByMe) return { redirect: false, current, blockedByMe, nextProfile: null } as const;
        const nextProfile = await loadSocialProfile(userId);
        const [nextCounts, nextPosts, nextRelation] = await Promise.all([
          getFollowCounts(userId), listProfilePosts(userId), current ? followStatus(userId) : Promise.resolve<FollowStatus>('none'),
        ]);
        return { redirect: false, current, blockedByMe, nextProfile, nextCounts, nextPosts, nextRelation } as const;
      })(), '用户主页读取超时，请检查网络后重试。', 16_000);
      if (result.redirect) { router.replace('/(tabs)/profile'); return; }
      setMe(result.current);
      setBlocked(result.blockedByMe);
      setProfile(result.nextProfile);
      if (!result.blockedByMe) {
        setCounts(result.nextCounts); setPosts(result.nextPosts); setRelation(result.nextRelation);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '请稍后重试');
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) void load(); }, [load, userId]);
  useForegroundRetry(Boolean(loadError), () => void load());

  const toggleFollow = async () => {
    if (!me) return router.push('/auth');
    setBusyAction('follow'); setFeedback(null);
    try {
      const nextRelation = await withUiTimeout(relation === 'none' ? followUser(userId) : unfollowUser(userId).then(() => 'none' as FollowStatus), '关注操作超时，请重试。');
      setRelation(nextRelation);
      try {
        setCounts(await withUiTimeout(getFollowCounts(userId), '关注数量同步超时，请稍后重试。'));
      } catch (error) {
        setFeedback({ title: '关注状态已更新', message: error instanceof Error ? error.message : '关注数量暂未同步', tone: 'error', retry: () => void load() });
        return;
      }
      setFeedback({ title: '关注状态已更新', message: nextRelation === 'none' ? '已取消关注。' : nextRelation === 'pending' ? '关注申请已发送。' : '已关注该用户。', tone: 'neutral' });
    } catch (error) {
      setFeedback({ title: '关注操作失败', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error', retry: () => void toggleFollow() });
    } finally { setBusyAction(''); }
  };

  const openChat = async () => {
    if (!me) return router.push('/auth');
    setBusyAction('chat'); setFeedback(null);
    try {
      const existing = await withUiTimeout(findConversationWith(userId), '私信连接超时，请重试。');
      if (existing) router.push(`/chat/${existing.id}`);
      else router.push({ pathname: '/chat/new', params: { userId } });
    } catch (error) {
      setFeedback({ title: '无法打开私信', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error', retry: () => void openChat() });
    } finally { setBusyAction(''); }
  };

  const unblock = async () => {
    setBusyAction('unblock'); setFeedback(null);
    try {
      await withUiTimeout(unblockUser(userId), '解除拉黑超时，请重试。');
      setBlocked(false); await load();
    } catch (error) {
      setFeedback({ title: '解除拉黑失败', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error', retry: () => void unblock() });
    } finally { setBusyAction(''); }
  };

  const confirmBlock = () => Alert.alert('拉黑这个用户？', '双方关注会解除，对方也不能再向你发送消息。', [
    { text: '取消', style: 'cancel' },
    { text: '确认拉黑', style: 'destructive', onPress: async () => {
      setBusyAction('block'); setFeedback(null);
      try { await withUiTimeout(blockUser(userId), '拉黑操作超时，请重试。'); setBlocked(true); setProfile(null); setPosts([]); }
      catch (error) { setFeedback({ title: '拉黑失败', message: error instanceof Error ? error.message : '请稍后重试', tone: 'error', retry: confirmBlock }); }
      finally { setBusyAction(''); }
    } },
  ]);

  if (loading) return <View style={styles.center}><AsyncStatePanel title="正在读取用户主页" message="正在同步最新资料和动态…" busy /></View>;
  if (loadError) return <View style={styles.center}><AsyncStatePanel testID="user-profile-error" title="暂时无法读取用户主页" message={loadError} tone="error" actionLabel="重新读取" onAction={() => void load()} /></View>;
  if (blocked) return <><Stack.Screen options={{ headerShown: true, title: '用户主页', headerBackTitle: '返回' }} /><View style={styles.center}><Text style={styles.blockTitle}>已拉黑该用户</Text><Text style={styles.muted}>对方无法关注你或向你发送私信。</Text>{feedback ? <AsyncStatePanel testID="user-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? '重试操作' : undefined} onAction={feedback.retry} busy={busyAction === 'unblock'} /> : null}<Pressable accessibilityRole="button" accessibilityLabel="解除拉黑" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.outlineSolo} onPress={() => void unblock()}><Text style={styles.outlineText}>{busyAction === 'unblock' ? '处理中…' : '解除拉黑'}</Text></Pressable></View></>;
  if (!profile) return <View style={styles.center}><AsyncStatePanel testID="user-profile-unavailable" title="该用户当前不可访问" message="账号可能已停用、隐藏或不存在。" actionLabel="重新读取" onAction={() => void load()} /></View>;
  const locked = profile.is_private && relation !== 'accepted';

  return <><Stack.Screen options={{ headerShown: true, title: profile.display_name || '用户主页', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    {feedback ? <AsyncStatePanel testID="user-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? '重试操作' : undefined} onAction={feedback.retry} busy={Boolean(busyAction)} /> : null}
    <ProfileHero profile={profile} followers={counts.followers} following={counts.following} onFollowers={() => router.push({ pathname: '/connections/followers', params: { userId } })} onFollowing={() => router.push({ pathname: '/connections/following', params: { userId } })} actions={<>
      <Pressable accessibilityRole="button" accessibilityLabel="切换关注状态" accessibilityState={{ disabled: Boolean(busyAction) }} style={[styles.primary, relation !== 'none' && styles.outline]} onPress={() => void toggleFollow()} disabled={Boolean(busyAction)}><Text style={relation === 'none' ? styles.primaryText : styles.outlineText}>{busyAction === 'follow' ? '处理中…' : relation === 'accepted' ? '已关注' : relation === 'pending' ? '已申请' : profile.is_private ? '申请关注' : '关注'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="发私信" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.outline} onPress={() => void openChat()}><Text style={styles.outlineText}>{busyAction === 'chat' ? '连接中…' : '发私信'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="更多用户操作" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.more} onPress={confirmBlock}><Text style={styles.moreText}>•••</Text></Pressable>
    </>} />
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>主页动态</Text><Text style={styles.sectionMeta}>{posts.length} 条</Text></View>
    {locked ? <View style={styles.locked}><Text style={styles.lockIcon}>🔒</Text><Text style={styles.lockTitle}>这是隐私账号</Text><Text style={styles.muted}>关注申请通过后，才能查看对方发布的图片和视频。</Text></View> : <ProfilePostList posts={posts} />}
  </ScrollView></>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:14,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:'#f5f6f8'},primary:{flex:1,backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},outline:{flex:1,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff',borderRadius:10,paddingVertical:11,alignItems:'center'},outlineSolo:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingHorizontal:22,paddingVertical:12,marginTop:18},outlineText:{color:'#344054',fontWeight:'900'},more:{width:46,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,alignItems:'center',justifyContent:'center'},moreText:{color:'#475467',fontWeight:'900'},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22,marginBottom:10,paddingHorizontal:3},sectionTitle:{fontSize:20,fontWeight:'900',color:'#101828'},sectionMeta:{color:'#98a2b3'},locked:{backgroundColor:'#fff',borderRadius:16,padding:32,alignItems:'center',borderWidth:1,borderColor:'#eaecf0'},lockIcon:{fontSize:28},lockTitle:{fontSize:18,fontWeight:'900',color:'#344054',marginTop:9,marginBottom:5},blockTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:8},muted:{color:'#98a2b3',textAlign:'center',lineHeight:21}
});
