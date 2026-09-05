import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { isAuthConfigured, supabase } from '../../src/auth/supabase';
import { fetchArticle } from '../../src/api/trrb';
import { accountLabel } from '../../src/auth/unified-account';
import { getFollowCounts, listFollowRequests } from '../../src/community/follows';
import { ProfileHero } from '../../src/components/ProfileHero';
import { ProfilePostList } from '../../src/components/ProfilePostList';
import { deleteProfilePost, listProfilePosts } from '../../src/social/posts';
import { loadSocialProfile } from '../../src/social/profiles';
import type { ProfilePost, SocialProfile } from '../../src/social/types';
import { syncFavoritesWithCloud, syncHistoryWithCloud } from '../../src/storage/library';
import { getReadingPreferences, ReadingPreferences, setReadingFontScale } from '../../src/storage/reading-preferences';
import { disableCurrentDevicePushToken } from '../../src/push/registration';
import { useI18n } from '../../src/i18n/I18nProvider';
import { languageName, MessageKey } from '../../src/i18n/i18n-core';
import { useUnreadCounts } from '../../src/notifications/UnreadProvider';

const FONT_OPTIONS: { label: MessageKey; scale: ReadingPreferences['fontScale'] }[] = [
  { label: 'profile.fontSmall', scale: 0.9 }, { label: 'profile.fontStandard', scale: 1 },
  { label: 'profile.fontLarge', scale: 1.15 }, { label: 'profile.fontExtraLarge', scale: 1.3 },
];

export default function ProfileScreen() {
  const { locale, t } = useI18n();
  const unread = useUnreadCounts();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [followRequests, setFollowRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fontScale, setFontScale] = useState<ReadingPreferences['fontScale']>(1);

  const loadProfile = useCallback(async (activeSession: Session | null = session) => {
    const userId = activeSession?.user.id;
    if (!userId) { setProfile(null); setPosts([]); return; }
    try {
      const [nextProfile, nextPosts, nextCounts, requests] = await Promise.all([
        loadSocialProfile(userId), listProfilePosts(userId), getFollowCounts(userId),
        listFollowRequests().catch(() => []),
      ]);
      setProfile(nextProfile); setPosts(nextPosts); setCounts(nextCounts); setFollowRequests(requests.length);
    } catch (error) { Alert.alert(t('profile.loadFailed'), error instanceof Error ? error.message : t('profile.retryLater')); }
  }, [session, t]);

  useEffect(() => {
    void getReadingPreferences().then((prefs) => setFontScale(prefs.fontScale));
    let mounted = true;
    let syncedUserId: string | null = null;
    const acceptSession = async (next: Session | null) => {
      if (!mounted) return;
      setSession(next); setLoading(false);
      const userId = next?.user.id || null;
      if (userId && syncedUserId !== userId) {
        syncedUserId = userId;
        void Promise.all([syncFavoritesWithCloud(fetchArticle), syncHistoryWithCloud(fetchArticle)]).catch(() => { syncedUserId = null; });
      }
      await loadProfile(next);
    };
    supabase.auth.getSession().then(({ data }) => void acceptSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setTimeout(() => void acceptSession(next), 0); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useFocusEffect(useCallback(() => { if (session) { void loadProfile(session); void unread.refresh().catch(() => undefined); } }, [loadProfile, session, unread.refresh]));

  const signOut = async () => {
    const finishSignOut = async () => { const { error } = await supabase.auth.signOut(); if (error) Alert.alert(t('profile.signOutFailed'), error.message); };
    try { await disableCurrentDevicePushToken(); await finishSignOut(); }
    catch { Alert.alert(t('profile.pushDisableFailed'), t('profile.pushDisableFailedMeta'), [{ text: t('profile.cancel'), style: 'cancel' }, { text: t('profile.signOutAnyway'), style: 'destructive', onPress: () => void finishSignOut() }]); }
  };

  const updateFontScale = async (scale: ReadingPreferences['fontScale']) => {
    try { await setReadingFontScale(scale); setFontScale(scale); }
    catch (error) { Alert.alert(t('profile.fontSaveFailed'), error instanceof Error ? error.message : t('profile.retryLater')); }
  };

  const removePost = async (post: ProfilePost) => {
    try { await deleteProfilePost(post); setPosts((rows) => rows.filter((row) => row.id !== post.id)); }
    catch (error) { Alert.alert(t('profile.deletePostFailed'), error instanceof Error ? error.message : t('profile.retryLater')); }
  };

  return <ScrollView testID="screen-profile" style={styles.page} contentContainerStyle={styles.pageContent}>
    {loading ? <ActivityIndicator style={styles.loader} color="#c8211e" /> : session && profile ? <>
      <ProfileHero profile={profile} followers={counts.followers} following={counts.following} own onEdit={() => router.push('/profile-settings')} onFollowers={() => router.push({ pathname: '/connections/followers', params: { userId: profile.id } })} onFollowing={() => router.push({ pathname: '/connections/following', params: { userId: profile.id } })} />
      <Text style={styles.account}>{t('profile.loggedIn', { account: accountLabel(session.user) })}</Text>
      <View style={styles.primaryActions}>
        <Pressable accessibilityRole="button" style={styles.publish} onPress={() => router.push('/profile-compose')}><Text style={styles.publishIcon}>＋</Text><Text style={styles.publishText}>{t('profile.publishPost')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/messages')}><Text style={styles.actionTitle}>{t('profile.messages')}{unread.messages ? t('profile.unread', { count: unread.messages }) : ''}</Text><Text style={styles.actionMeta}>{t('profile.messagesMeta')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/follow-requests')}><Text style={styles.actionTitle}>{t('profile.followRequests')}{followRequests ? t('profile.pendingCount', { count: followRequests }) : ''}</Text><Text style={styles.actionMeta}>{t('profile.followRequestsMeta')}</Text></Pressable>
      </View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('profile.myPosts')}</Text><Text style={styles.sectionMeta}>{t('profile.postCount', { count: posts.length })}</Text></View>
      <ProfilePostList posts={posts} own onDelete={removePost} />
      <Text style={styles.groupTitle}>{t('profile.contentInteraction')}</Text>
      <View style={styles.menuGroup}>
        <Menu title={t('profile.community')} meta={t('profile.communityMemberMeta')} onPress={() => router.push('/community')} />
        <Menu title={`${t('profile.notifications')}${unread.notifications ? t('profile.unread', { count: unread.notifications }) : ''}`} meta={t('profile.notificationsMeta')} onPress={() => router.push('/notifications')} />
        <Menu title={t('profile.comments')} meta={t('profile.commentsMeta')} onPress={() => router.push('/my-comments')} />
        <Menu title={t('profile.favorites')} meta={t('profile.favoritesMeta')} onPress={() => router.push('/favorites')} />
        <Menu title={t('profile.history')} meta={t('profile.historyMeta')} onPress={() => router.push('/history')} last />
      </View>
      <Text style={styles.groupTitle}>{t('profile.settings')}</Text>
      <View style={styles.menuGroup}>
        <Menu title={t('profile.accountPrivacy')} meta={t('profile.accountPrivacyMeta')} onPress={() => router.push('/profile-settings')} />
        <Menu testID="open-language-settings" title={t('profile.language')} meta={t('profile.languageMeta', { language: languageName(locale) })} onPress={() => router.push('/language-settings')} />
        <Menu title={t('profile.pushSettings')} meta={t('profile.pushSettingsMeta')} onPress={() => router.push('/push-settings')} last />
      </View>
      <View style={styles.fontCard}><Text style={styles.cardTitle}>{t('profile.fontSize')}</Text><Text style={styles.cardMeta}>{t('profile.fontSizeMeta')}</Text><View style={styles.fontRow}>{FONT_OPTIONS.map((option) => <Pressable key={option.scale} testID={`font-scale-${option.scale}`} onPress={() => void updateFontScale(option.scale)} style={[styles.fontOption, fontScale === option.scale && styles.fontOptionActive]}><Text style={[styles.fontOptionText, fontScale === option.scale && styles.fontOptionTextActive]}>{t(option.label)}</Text></Pressable>)}</View><Text testID="font-scale-preview" style={[styles.fontPreview, { fontSize: 17 * fontScale, lineHeight: 26 * fontScale }]}>{t('profile.fontPreview')}</Text></View>
      <Pressable testID="profile-sign-out" style={styles.signOut} onPress={() => void signOut()}><Text style={styles.signOutText}>{t('profile.signOut')}</Text></Pressable>
    </> : <>
      <Text style={styles.h1}>{t('profile.heading')}</Text><Text style={styles.sub}>{t('profile.guest')}</Text>
      {!isAuthConfigured ? <Text style={styles.warning}>{t('profile.authWarning')}</Text> : null}
      <Pressable testID="profile-login" style={styles.login} onPress={() => router.push('/auth')}><Text style={styles.loginText}>{t('profile.login')}</Text></Pressable>
      <View style={styles.menuGroup}><Menu title={t('profile.community')} meta={t('profile.communityGuestMeta')} onPress={() => router.push('/community')} /><Menu title={t('profile.localFavorites')} meta={t('profile.localFavoritesMeta')} onPress={() => router.push('/favorites')} /><Menu title={t('profile.localHistory')} meta={t('profile.localHistoryMeta')} onPress={() => router.push('/history')} last /></View>
    </>}
    <Pressable style={styles.website} onPress={() => Linking.openURL('https://trrb.net')}><Text style={styles.websiteText}>{t('profile.openWebsite')}</Text></Pressable>
  </ScrollView>;
}

function Menu({ title, meta, onPress, last, testID }: { title: string; meta: string; onPress: () => void; last?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${meta}`} testID={testID} onPress={onPress} style={[styles.menu, last && styles.menuLast]}><View style={styles.menuCopy}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuMeta}>{meta}</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},pageContent:{padding:14,paddingTop:54,paddingBottom:42},loader:{marginVertical:40},h1:{fontSize:32,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},account:{color:'#667085',fontSize:12,marginTop:8,marginLeft:4},warning:{backgroundColor:'#fff4e5',color:'#8a4b08',padding:12,borderRadius:10,marginBottom:12},primaryActions:{flexDirection:'row',gap:8,marginTop:14},publish:{flex:1.08,backgroundColor:'#c8211e',borderRadius:14,padding:13,alignItems:'center',justifyContent:'center'},publishIcon:{color:'#fff',fontSize:22,fontWeight:'500',lineHeight:22},publishText:{color:'#fff',fontWeight:'900',marginTop:3},action:{flex:1,backgroundColor:'#fff',borderRadius:14,padding:13,borderWidth:1,borderColor:'#eaecf0',justifyContent:'center'},actionTitle:{fontWeight:'900',color:'#101828'},actionMeta:{fontSize:12,color:'#98a2b3',marginTop:4},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:24,marginBottom:10,paddingHorizontal:3},sectionTitle:{fontSize:20,fontWeight:'900',color:'#101828'},sectionMeta:{color:'#98a2b3'},groupTitle:{fontSize:20,fontWeight:'900',color:'#101828',marginTop:26,marginBottom:10,paddingHorizontal:3},menuGroup:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#eaecf0',overflow:'hidden'},menu:{padding:16,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#f2f4f7'},menuLast:{borderBottomWidth:0},menuCopy:{flex:1},menuTitle:{fontSize:17,fontWeight:'900',color:'#101828'},menuMeta:{color:'#98a2b3',fontSize:13,marginTop:5},chevron:{fontSize:28,color:'#98a2b3'},fontCard:{backgroundColor:'#fff',borderRadius:16,padding:16,marginTop:12,borderWidth:1,borderColor:'#eaecf0'},cardTitle:{fontSize:17,fontWeight:'900',color:'#101828'},cardMeta:{color:'#98a2b3',fontSize:13,marginTop:5},fontRow:{flexDirection:'row',gap:6,marginTop:14},fontOption:{flex:1,borderWidth:1,borderColor:'#d0d5dd',borderRadius:9,paddingVertical:9,alignItems:'center'},fontOptionActive:{backgroundColor:'#c8211e',borderColor:'#c8211e'},fontOptionText:{fontWeight:'800',fontSize:12,color:'#475467'},fontOptionTextActive:{color:'#fff'},fontPreview:{color:'#344054',marginTop:14},login:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center',marginBottom:14},loginText:{color:'#fff',fontWeight:'800',fontSize:16},signOut:{borderWidth:1,borderColor:'#d0d5dd',padding:14,borderRadius:12,alignItems:'center',marginTop:18},signOutText:{color:'#475467',fontWeight:'800'},website:{alignItems:'center',padding:16,marginTop:6},websiteText:{color:'#667085',fontWeight:'800'}
});
