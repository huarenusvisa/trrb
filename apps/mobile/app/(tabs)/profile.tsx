import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { isAuthConfigured, supabase } from '../../src/auth/supabase';
import { fetchArticle } from '../../src/api/trrb';
import { accountLabel } from '../../src/auth/unified-account';
import { unreadNotificationCount } from '../../src/community/notifications';
import { syncFavoritesWithCloud, syncHistoryWithCloud } from '../../src/storage/library';
import { getReadingPreferences, ReadingPreferences, setReadingFontScale } from '../../src/storage/reading-preferences';
import { disableCurrentDevicePushToken } from '../../src/push/registration';
import { useI18n } from '../../src/i18n/I18nProvider';
import { languageName, MessageKey } from '../../src/i18n/i18n-core';

const FONT_OPTIONS: { label: MessageKey; scale: ReadingPreferences['fontScale'] }[] = [
  { label: 'profile.fontSmall', scale: 0.9 },
  { label: 'profile.fontStandard', scale: 1 },
  { label: 'profile.fontLarge', scale: 1.15 },
  { label: 'profile.fontExtraLarge', scale: 1.3 },
];

export default function ProfileScreen() {
  const { locale, t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [fontScale, setFontScale] = useState<ReadingPreferences['fontScale']>(1);

  useEffect(() => {
    void getReadingPreferences().then((prefs) => setFontScale(prefs.fontScale));
    let mounted = true;
    let syncedUserId: string | null = null;
    const syncLibrary = (nextSession: Session | null) => {
      const userId = nextSession?.user.id || null;
      if (!userId || syncedUserId === userId) return;
      syncedUserId = userId;
      void Promise.all([syncFavoritesWithCloud(fetchArticle), syncHistoryWithCloud(fetchArticle)]).catch(() => {
        // Keep local data and allow each library screen to retry when connectivity returns.
        syncedUserId = null;
      });
    };
    supabase.auth.getSession().then(async ({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
        syncLibrary(data.session);
        if (data.session) setUnread(await unreadNotificationCount().catch(() => 0));
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      syncLibrary(nextSession);
      setUnread(nextSession ? await unreadNotificationCount().catch(() => 0) : 0);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const finishSignOut = async () => {
      const { error } = await supabase.auth.signOut();
      if (error) Alert.alert(t('profile.signOutFailed'), error.message);
    };
    try {
      await disableCurrentDevicePushToken();
      await finishSignOut();
    } catch {
      Alert.alert(t('profile.pushDisableFailed'), t('profile.pushDisableFailedMeta'), [
        { text: t('profile.cancel'), style: 'cancel' },
        { text: t('profile.signOutAnyway'), style: 'destructive', onPress: () => void finishSignOut() }
      ]);
    }
  };

  const updateFontScale = async (scale: ReadingPreferences['fontScale']) => {
    setFontScale(scale);
    await setReadingFontScale(scale);
  };

  return (
    <ScrollView testID="screen-profile" style={styles.page} contentContainerStyle={styles.pageContent}>
      <Text style={styles.h1}>{t('profile.heading')}</Text>
      {loading ? <ActivityIndicator style={styles.loader} /> : session ? <>
        <Text testID="account-status" style={styles.sub}>{t('profile.loggedIn', { account: accountLabel(session.user) })}</Text>
        <Pressable testID="open-community" style={styles.item} onPress={()=>router.push('/community')}><Text style={styles.title}>{t('profile.community')}</Text><Text style={styles.meta}>{t('profile.communityMemberMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/notifications')}><Text style={styles.title}>{t('profile.notifications')}{unread ? t('profile.unread', { count: unread }) : ''}</Text><Text style={styles.meta}>{t('profile.notificationsMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/my-comments')}><Text style={styles.title}>{t('profile.comments')}</Text><Text style={styles.meta}>{t('profile.commentsMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/favorites')}><Text style={styles.title}>{t('profile.favorites')}</Text><Text style={styles.meta}>{t('profile.favoritesMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/history')}><Text style={styles.title}>{t('profile.history')}</Text><Text style={styles.meta}>{t('profile.historyMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/profile-settings')}><Text style={styles.title}>{t('profile.accountSettings')}</Text><Text style={styles.meta}>{t('profile.accountSettingsMeta')}</Text></Pressable>
        <Pressable testID="profile-sign-out" style={styles.signOut} onPress={signOut}><Text style={styles.signOutText}>{t('profile.signOut')}</Text></Pressable>
      </> : <>
        <Text style={styles.sub}>{t('profile.guest')}</Text>
        {!isAuthConfigured ? <Text style={styles.warning}>{t('profile.authWarning')}</Text> : null}
        <Pressable testID="profile-login" style={styles.login} onPress={()=>router.push('/auth')}><Text style={styles.loginText}>{t('profile.login')}</Text></Pressable>
        <Pressable testID="open-community-guest" style={styles.item} onPress={()=>router.push('/community')}><Text style={styles.title}>{t('profile.community')}</Text><Text style={styles.meta}>{t('profile.communityGuestMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/favorites')}><Text style={styles.title}>{t('profile.localFavorites')}</Text><Text style={styles.meta}>{t('profile.localFavoritesMeta')}</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/history')}><Text style={styles.title}>{t('profile.localHistory')}</Text><Text style={styles.meta}>{t('profile.localHistoryMeta')}</Text></Pressable>
      </>}
      <Pressable testID="open-language-settings" style={styles.item} onPress={() => router.push('/language-settings')}><Text style={styles.title}>{t('profile.language')}</Text><Text style={styles.meta}>{t('profile.languageMeta', { language: languageName(locale) })}</Text></Pressable>
      <View style={styles.item}>
        <Text style={styles.title}>{t('profile.fontSize')}</Text>
        <Text style={styles.meta}>{t('profile.fontSizeMeta')}</Text>
        <View style={styles.fontRow}>
          {FONT_OPTIONS.map((option) => (
            <Pressable key={option.scale} onPress={() => void updateFontScale(option.scale)} style={[styles.fontOption, fontScale === option.scale && styles.fontOptionActive]}>
              <Text style={[styles.fontOptionText, fontScale === option.scale && styles.fontOptionTextActive]}>{t(option.label)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable testID="open-push-settings" style={styles.item} onPress={() => session ? router.push('/push-settings') : router.push('/auth')}><Text style={styles.title}>{t('profile.pushSettings')}</Text><Text style={styles.meta}>{session ? t('profile.pushSettingsMeta') : t('profile.pushSettingsGuestMeta')}</Text></Pressable>
      <Pressable style={styles.item} onPress={() => Linking.openURL('https://trrb.net')}><Text style={styles.title}>{t('profile.openWebsite')}</Text><Text style={styles.meta}>{t('profile.openWebsiteMeta')}</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},pageContent:{padding:16,paddingTop:58,paddingBottom:40},h1:{fontSize:32,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},loader:{marginVertical:20},warning:{backgroundColor:'#fff4e5',color:'#8a4b08',padding:12,borderRadius:10,marginBottom:12},item:{backgroundColor:'#fff',padding:18,borderRadius:14,marginBottom:12},title:{fontSize:18,fontWeight:'800',color:'#101828'},meta:{color:'#98a2b3',marginTop:6},fontRow:{flexDirection:'row',gap:8,marginTop:14},fontOption:{flex:1,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingVertical:10,alignItems:'center',backgroundColor:'#fff'},fontOptionActive:{backgroundColor:'#c8211e',borderColor:'#c8211e'},fontOptionText:{fontWeight:'800',color:'#475467'},fontOptionTextActive:{color:'#fff'},login:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center',marginBottom:14},loginText:{color:'#fff',fontWeight:'800',fontSize:16},signOut:{borderWidth:1,borderColor:'#d0d5dd',padding:14,borderRadius:12,alignItems:'center',marginBottom:12},signOutText:{color:'#475467',fontWeight:'800'}});
