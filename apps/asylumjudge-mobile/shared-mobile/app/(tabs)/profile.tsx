import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { languageName, MessageKey, SupportedLocale } from '../../src/i18n/i18n-core';
import { useUnreadCounts } from '../../src/notifications/UnreadProvider';

const FONT_OPTIONS: { label: MessageKey; scale: ReadingPreferences['fontScale'] }[] = [
  { label: 'profile.fontSmall', scale: 0.9 }, { label: 'profile.fontStandard', scale: 1 },
  { label: 'profile.fontLarge', scale: 1.15 }, { label: 'profile.fontExtraLarge', scale: 1.3 },
];

const QUICK_LANGUAGES: { locale: SupportedLocale; label: string }[] = [
  { locale: 'zh-CN', label: '简体' },
  { locale: 'zh-TW', label: '繁體' },
  { locale: 'en', label: 'EN' },
];

export default function ProfileScreen() {
  const { locale, setPreference, t } = useI18n();
  const unread = useUnreadCounts();
  const insets = useSafeAreaInsets();
  const { fontScale: deviceFontScale, width } = useWindowDimensions();
  const compact = width < 390 || deviceFontScale > 1.15;
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

  return <ScrollView
      testID="screen-profile"
      style={styles.page}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.pageContent, { paddingHorizontal: width < 390 ? 10 : 16, paddingBottom: Math.max(32, insets.bottom + 20) }]}
    >
    <View testID="quick-language-picker" accessibilityRole="radiogroup" style={styles.languagePicker}>
      {QUICK_LANGUAGES.map((option) => {
        const selected = option.locale === locale;
        return <Pressable key={option.locale} testID={`quick-language-${option.locale}`} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => void setPreference(option.locale)} style={[styles.languageOption, selected && styles.languageOptionActive]}><Text style={[styles.languageOptionText, selected && styles.languageOptionTextActive]}>{option.label}</Text></Pressable>;
      })}
    </View>
    {loading ? <ActivityIndicator style={styles.loader} color="#14804a" /> : session && profile ? <>
      <ProfileHero profile={profile} followers={counts.followers} following={counts.following} account={t('profile.loggedIn', { account: accountLabel(session.user) })} own onEdit={() => router.push('/profile-settings')} onFollowers={() => router.push({ pathname: '/connections/followers', params: { userId: profile.id } })} onFollowing={() => router.push({ pathname: '/connections/following', params: { userId: profile.id } })} />
      <View style={[styles.primaryActions, compact && styles.primaryActionsCompact]}>
        <Pressable accessibilityRole="button" style={styles.publish} onPress={() => router.push('/profile-compose')}><Text style={styles.publishIcon}>＋</Text><Text style={styles.publishText}>{t('profile.publishPost')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/messages')}><Text style={styles.actionTitle}>{t('profile.messages')}{unread.messages ? t('profile.unread', { count: unread.messages }) : ''}</Text><Text style={styles.actionMeta}>{t('profile.messagesMeta')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/follow-requests')}><Text style={styles.actionTitle}>{t('profile.followRequests')}{followRequests ? t('profile.pendingCount', { count: followRequests }) : ''}</Text><Text style={styles.actionMeta}>{t('profile.followRequestsMeta')}</Text></Pressable>
      </View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('profile.myPosts')}</Text><Text style={styles.sectionMeta}>{t('profile.postCount', { count: posts.length })}</Text></View>
      <ProfilePostList posts={posts} own onDelete={removePost} />
      <Text style={styles.groupTitle}>{t('profile.contentInteraction')}</Text>
      <View style={styles.menuGroup}>
        <Menu testID="profile-find-people" title={t('profile.findPeople')} meta={t('profile.findPeopleMeta')} onPress={() => router.push('/user-search')} />
        <Menu title={t('profile.community')} meta={t('profile.communityMemberMeta')} onPress={() => router.push('/community')} />
        <Menu title={`${t('profile.notifications')}${unread.notifications ? t('profile.unread', { count: unread.notifications }) : ''}`} meta={t('profile.notificationsMeta')} onPress={() => router.push('/notifications')} />
        <Menu title={t('profile.comments')} meta={t('profile.commentsMeta')} onPress={() => router.push('/my-comments')} />
        <Menu title={t('profile.favorites')} meta={t('profile.favoritesMeta')} onPress={() => router.push('/favorites')} />
        <Menu title={t('profile.history')} meta={t('profile.historyMeta')} onPress={() => router.push('/history')} last />
      </View>
      <Text style={styles.groupTitle}>{t('profile.settings')}</Text>
      <View style={styles.menuGroup}>
        <Menu testID="profile-account-security" title={t('profile.accountSecurity')} meta={t('profile.accountSecurityMeta')} onPress={() => router.push('/account-security')} />
        <Menu title={t('profile.accountPrivacy')} meta={t('profile.accountPrivacyMeta')} onPress={() => router.push('/profile-settings')} />
        <Menu testID="open-language-settings" title={t('profile.language')} meta={t('profile.languageMeta', { language: languageName(locale) })} onPress={() => router.push('/language-settings')} />
        <Menu title={t('profile.pushSettings')} meta={t('profile.pushSettingsMeta')} onPress={() => router.push('/push-settings')} last />
      </View>
      <View style={styles.fontCard}><Text style={styles.cardTitle}>{t('profile.fontSize')}</Text><Text style={styles.cardMeta}>{t('profile.fontSizeMeta')}</Text><View style={[styles.fontRow, compact && styles.fontRowCompact]}>{FONT_OPTIONS.map((option) => <Pressable key={option.scale} testID={`font-scale-${option.scale}`} onPress={() => void updateFontScale(option.scale)} style={[styles.fontOption, compact && styles.fontOptionCompact, fontScale === option.scale && styles.fontOptionActive]}><Text style={[styles.fontOptionText, fontScale === option.scale && styles.fontOptionTextActive]}>{t(option.label)}</Text></Pressable>)}</View><Text testID="font-scale-preview" style={[styles.fontPreview, { fontSize: 17 * fontScale, lineHeight: 26 * fontScale }]}>{t('profile.fontPreview')}</Text></View>
      <Pressable testID="profile-sign-out" style={styles.signOut} onPress={() => void signOut()}><Text style={styles.signOutText}>{t('profile.signOut')}</Text></Pressable>
    </> : <>
      <Text style={styles.h1}>{t('profile.heading')}</Text><Text style={styles.sub}>{t('profile.guest')}</Text>
      {!isAuthConfigured ? <Text style={styles.warning}>{t('profile.authWarning')}</Text> : null}
      <Pressable testID="profile-login" style={styles.login} onPress={() => router.push('/auth')}><Text style={styles.loginText}>{t('profile.login')}</Text></Pressable>
      <View style={styles.menuGroup}><Menu title={t('profile.community')} meta={t('profile.communityGuestMeta')} onPress={() => router.push('/community')} /><Menu title={t('profile.localFavorites')} meta={t('profile.localFavoritesMeta')} onPress={() => router.push('/favorites')} /><Menu title={t('profile.localHistory')} meta={t('profile.localHistoryMeta')} onPress={() => router.push('/history')} last /></View>
    </>}
    <Text style={styles.groupTitle}>{t('profile.helpPrivacy')}</Text>
    <View style={styles.menuGroup}>
      <Menu testID="profile-support" title={t('profile.support')} meta={t('profile.supportMeta')} onPress={() => void Linking.openURL('https://trrb.net/app-support.html')} />
      <Menu testID="profile-privacy" title={t('profile.privacy')} meta={t('profile.privacyMeta')} onPress={() => void Linking.openURL('https://trrb.net/privacy.html')} />
      <Menu testID="profile-terms" title={t('profile.terms')} meta={t('profile.termsMeta')} onPress={() => void Linking.openURL('https://trrb.net/terms.html')} last />
    </View>
  </ScrollView>;
}

function Menu({ title, meta, onPress, last, testID }: { title: string; meta: string; onPress: () => void; last?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${meta}`} testID={testID} onPress={onPress} style={[styles.menu, last && styles.menuLast]}><View style={styles.menuCopy}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuMeta}>{meta}</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f4f8f5'},
  pageContent:{width:'100%',maxWidth:720,alignSelf:'center',paddingTop:10},
  languagePicker:{alignSelf:'flex-end',flexDirection:'row',padding:3,borderWidth:1,borderColor:'#cddbd2',borderRadius:999,backgroundColor:'#fff',marginBottom:14},
  languageOption:{minWidth:50,minHeight:38,paddingHorizontal:10,alignItems:'center',justifyContent:'center',borderRadius:999},
  languageOptionActive:{backgroundColor:'#14804a'},
  languageOptionText:{color:'#607067',fontSize:13,fontWeight:'900'},
  languageOptionTextActive:{color:'#fff'},
  loader:{marginVertical:40},
  h1:{fontSize:30,lineHeight:38,fontWeight:'900',color:'#102019'},
  sub:{color:'#617168',fontSize:15,lineHeight:22,marginTop:4,marginBottom:16},
  warning:{backgroundColor:'#fff8e8',color:'#8a4b08',padding:12,borderRadius:12,marginBottom:12,borderWidth:1,borderColor:'#f6dfae'},
  primaryActions:{flexDirection:'row',gap:9,marginTop:14},
  primaryActionsCompact:{flexDirection:'column'},
  publish:{flex:1.08,minHeight:64,backgroundColor:'#14804a',borderRadius:16,padding:12,alignItems:'center',justifyContent:'center'},
  publishIcon:{color:'#fff',fontSize:22,fontWeight:'500',lineHeight:22},
  publishText:{color:'#fff',fontWeight:'900',marginTop:3,textAlign:'center'},
  action:{flex:1,minHeight:64,backgroundColor:'#fff',borderRadius:16,padding:12,borderWidth:1,borderColor:'#dbe6df',justifyContent:'center'},
  actionTitle:{fontWeight:'900',color:'#102019'},
  actionMeta:{fontSize:12,lineHeight:17,color:'#748279',marginTop:4},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22,marginBottom:9,paddingHorizontal:3},
  sectionTitle:{fontSize:19,fontWeight:'900',color:'#102019'},
  sectionMeta:{color:'#748279'},
  groupTitle:{fontSize:19,lineHeight:26,fontWeight:'900',color:'#102019',marginTop:23,marginBottom:9,paddingHorizontal:3},
  menuGroup:{backgroundColor:'#fff',borderRadius:18,borderWidth:1,borderColor:'#dbe6df',overflow:'hidden',shadowColor:'#173f2b',shadowOpacity:.04,shadowRadius:10,shadowOffset:{width:0,height:3}},
  menu:{minHeight:62,paddingHorizontal:16,paddingVertical:12,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#edf2ef'},
  menuLast:{borderBottomWidth:0},
  menuCopy:{flex:1,minWidth:0,paddingRight:10},
  menuTitle:{fontSize:16,lineHeight:21,fontWeight:'900',color:'#102019'},
  menuMeta:{color:'#617168',fontSize:13,lineHeight:18,marginTop:3},
  chevron:{fontSize:27,color:'#8ca096'},
  fontCard:{backgroundColor:'#fff',borderRadius:18,padding:16,marginTop:12,borderWidth:1,borderColor:'#dbe6df'},
  cardTitle:{fontSize:16,fontWeight:'900',color:'#102019'},
  cardMeta:{color:'#617168',fontSize:13,lineHeight:19,marginTop:5},
  fontRow:{flexDirection:'row',gap:6,marginTop:14},
  fontRowCompact:{flexWrap:'wrap'},
  fontOption:{flex:1,minHeight:44,borderWidth:1,borderColor:'#cddbd2',borderRadius:10,paddingHorizontal:6,alignItems:'center',justifyContent:'center'},
  fontOptionCompact:{flexBasis:'47%'},
  fontOptionActive:{backgroundColor:'#14804a',borderColor:'#14804a'},
  fontOptionText:{fontWeight:'800',fontSize:12,color:'#526159',textAlign:'center'},
  fontOptionTextActive:{color:'#fff'},
  fontPreview:{color:'#344a3f',marginTop:14},
  login:{minHeight:52,backgroundColor:'#14804a',padding:14,borderRadius:16,alignItems:'center',justifyContent:'center',marginBottom:14,shadowColor:'#14804a',shadowOpacity:.14,shadowRadius:10,shadowOffset:{width:0,height:4}},
  loginText:{color:'#fff',fontWeight:'900',fontSize:16},
  signOut:{minHeight:50,borderWidth:1,borderColor:'#b9c9c0',backgroundColor:'#fff',padding:14,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:18},
  signOutText:{color:'#526159',fontWeight:'800'}
});
