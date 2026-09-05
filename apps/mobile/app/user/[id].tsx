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
import { useI18n } from '../../src/i18n/I18nProvider';

type ActionFeedback = { title: string; message: string; tone: 'neutral' | 'error'; retry?: () => void };

export default function UserProfileScreen() {
  const { t } = useI18n();
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
      })(), t('userProfile.loadTimeout'), 16_000);
      if (result.redirect) { router.replace('/(tabs)/profile'); return; }
      setMe(result.current);
      setBlocked(result.blockedByMe);
      setProfile(result.nextProfile);
      if (!result.blockedByMe) {
        setCounts(result.nextCounts); setPosts(result.nextPosts); setRelation(result.nextRelation);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('userProfile.retryLater'));
    } finally { setLoading(false); }
  }, [t, userId]);

  useEffect(() => { if (userId) void load(); }, [load, userId]);
  useForegroundRetry(Boolean(loadError), () => void load());

  const toggleFollow = async () => {
    if (!me) return router.push('/auth');
    setBusyAction('follow'); setFeedback(null);
    try {
      const nextRelation = await withUiTimeout(relation === 'none' ? followUser(userId) : unfollowUser(userId).then(() => 'none' as FollowStatus), t('userProfile.followTimeout'));
      setRelation(nextRelation);
      try {
        setCounts(await withUiTimeout(getFollowCounts(userId), t('userProfile.countsTimeout')));
      } catch (error) {
        setFeedback({ title: t('userProfile.followUpdated'), message: error instanceof Error ? error.message : t('userProfile.countsNotSynced'), tone: 'error', retry: () => void load() });
        return;
      }
      setFeedback({ title: t('userProfile.followUpdated'), message: nextRelation === 'none' ? t('userProfile.unfollowed') : nextRelation === 'pending' ? t('userProfile.requestSent') : t('userProfile.followingNow'), tone: 'neutral' });
    } catch (error) {
      setFeedback({ title: t('userProfile.followFailed'), message: error instanceof Error ? error.message : t('userProfile.retryLater'), tone: 'error', retry: () => void toggleFollow() });
    } finally { setBusyAction(''); }
  };

  const openChat = async () => {
    if (!me) return router.push('/auth');
    setBusyAction('chat'); setFeedback(null);
    try {
      const existing = await withUiTimeout(findConversationWith(userId), t('userProfile.chatTimeout'));
      if (existing) router.push(`/chat/${existing.id}`);
      else router.push({ pathname: '/chat/new', params: { userId } });
    } catch (error) {
      setFeedback({ title: t('userProfile.chatFailed'), message: error instanceof Error ? error.message : t('userProfile.retryLater'), tone: 'error', retry: () => void openChat() });
    } finally { setBusyAction(''); }
  };

  const unblock = async () => {
    setBusyAction('unblock'); setFeedback(null);
    try {
      await withUiTimeout(unblockUser(userId), t('userProfile.unblockTimeout'));
      setBlocked(false); await load();
    } catch (error) {
      setFeedback({ title: t('userProfile.unblockFailed'), message: error instanceof Error ? error.message : t('userProfile.retryLater'), tone: 'error', retry: () => void unblock() });
    } finally { setBusyAction(''); }
  };

  const confirmBlock = () => Alert.alert(t('userProfile.blockConfirmTitle'), t('userProfile.blockConfirmBody'), [
    { text: t('userProfile.cancel'), style: 'cancel' },
    { text: t('userProfile.confirmBlock'), style: 'destructive', onPress: async () => {
      setBusyAction('block'); setFeedback(null);
      try { await withUiTimeout(blockUser(userId), t('userProfile.blockTimeout')); setBlocked(true); setProfile(null); setPosts([]); }
      catch (error) { setFeedback({ title: t('userProfile.blockFailed'), message: error instanceof Error ? error.message : t('userProfile.retryLater'), tone: 'error', retry: confirmBlock }); }
      finally { setBusyAction(''); }
    } },
  ]);

  if (loading) return <View style={styles.center}><AsyncStatePanel title={t('userProfile.loadingTitle')} message={t('userProfile.loadingBody')} busy /></View>;
  if (loadError) return <View style={styles.center}><AsyncStatePanel testID="user-profile-error" title={t('userProfile.loadErrorTitle')} message={loadError} tone="error" actionLabel={t('userProfile.reload')} onAction={() => void load()} /></View>;
  if (blocked) return <><Stack.Screen options={{ headerShown: true, title: t('userProfile.screenTitle'), headerBackTitle: t('common.back') }} /><View style={styles.center}><Text style={styles.blockTitle}>{t('userProfile.blockedTitle')}</Text><Text style={styles.muted}>{t('userProfile.blockedBody')}</Text>{feedback ? <AsyncStatePanel testID="user-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? t('userProfile.retryAction') : undefined} onAction={feedback.retry} busy={busyAction === 'unblock'} /> : null}<Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.unblock')} accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.outlineSolo} onPress={() => void unblock()}><Text style={styles.outlineText}>{busyAction === 'unblock' ? t('userProfile.processing') : t('userProfile.unblock')}</Text></Pressable></View></>;
  if (!profile) return <View style={styles.center}><AsyncStatePanel testID="user-profile-unavailable" title={t('userProfile.unavailableTitle')} message={t('userProfile.unavailableBody')} actionLabel={t('userProfile.reload')} onAction={() => void load()} /></View>;
  const locked = profile.is_private && relation !== 'accepted';

  return <><Stack.Screen options={{ headerShown: true, title: profile.display_name || t('userProfile.screenTitle'), headerBackTitle: t('common.back') }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    {feedback ? <AsyncStatePanel testID="user-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? t('userProfile.retryAction') : undefined} onAction={feedback.retry} busy={Boolean(busyAction)} /> : null}
    <ProfileHero profile={profile} followers={counts.followers} following={counts.following} onFollowers={() => router.push({ pathname: '/connections/followers', params: { userId } })} onFollowing={() => router.push({ pathname: '/connections/following', params: { userId } })} actions={<>
      <Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.followA11y')} accessibilityState={{ disabled: Boolean(busyAction) }} style={[styles.primary, relation !== 'none' && styles.outline]} onPress={() => void toggleFollow()} disabled={Boolean(busyAction)}><Text style={relation === 'none' ? styles.primaryText : styles.outlineText}>{busyAction === 'follow' ? t('userProfile.processing') : relation === 'accepted' ? t('userProfile.following') : relation === 'pending' ? t('userProfile.requested') : profile.is_private ? t('userProfile.requestFollow') : t('userProfile.follow')}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.message')} accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.outline} onPress={() => void openChat()}><Text style={styles.outlineText}>{busyAction === 'chat' ? t('userProfile.connecting') : t('userProfile.message')}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.moreA11y')} accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.more} onPress={confirmBlock}><Text style={styles.moreText}>•••</Text></Pressable>
    </>} />
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('userProfile.posts')}</Text><Text style={styles.sectionMeta}>{t('userProfile.postCount', { count: posts.length })}</Text></View>
    {locked ? <View style={styles.locked}><Text style={styles.lockIcon}>🔒</Text><Text style={styles.lockTitle}>{t('userProfile.privateTitle')}</Text><Text style={styles.muted}>{t('userProfile.privateBody')}</Text></View> : <ProfilePostList posts={posts} />}
  </ScrollView></>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:14,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:'#f5f6f8'},primary:{flex:1,backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},outline:{flex:1,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff',borderRadius:10,paddingVertical:11,alignItems:'center'},outlineSolo:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingHorizontal:22,paddingVertical:12,marginTop:18},outlineText:{color:'#344054',fontWeight:'900'},more:{width:46,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,alignItems:'center',justifyContent:'center'},moreText:{color:'#475467',fontWeight:'900'},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22,marginBottom:10,paddingHorizontal:3},sectionTitle:{fontSize:20,fontWeight:'900',color:'#101828'},sectionMeta:{color:'#98a2b3'},locked:{backgroundColor:'#fff',borderRadius:16,padding:32,alignItems:'center',borderWidth:1,borderColor:'#eaecf0'},lockIcon:{fontSize:28},lockTitle:{fontSize:18,fontWeight:'900',color:'#344054',marginTop:9,marginBottom:5},blockTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:8},muted:{color:'#98a2b3',textAlign:'center',lineHeight:21}
});
