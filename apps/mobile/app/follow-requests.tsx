import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { answerFollowRequest, listFollowRequests } from '../src/community/follows';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import type { SocialProfile } from '../src/social/types';
import { withUiTimeout } from '../src/utils/async-state-core';

type Request = { profile: SocialProfile; created_at: string };

export default function FollowRequestsScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setItems(await withUiTimeout(listFollowRequests(), t('followRequests.timeout'))); setError(''); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : t('followRequests.loadFailed')); }
    finally { setLoading(false); setRefreshing(false); }
  }, [t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });
  const retry = () => { setRefreshing(true); void load(); };
  const answer = async (id: string, accept: boolean) => { try { await answerFollowRequest(id, accept); setItems((rows) => rows.filter((row) => row.profile.id !== id)); } catch (error) { Alert.alert(t('followRequests.actionFailed'), error instanceof Error ? error.message : t('followRequests.retryLater')); } };
  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: t('followRequests.screenTitle'), headerBackTitle: t('common.back') }} />{loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="follow-requests-loading" title={t('followRequests.loadingTitle')} message={t('followRequests.loadingBody')} busy /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}>
    {error ? <AsyncStatePanel testID="follow-requests-error" tone="error" title={t('followRequests.unavailable')} message={error} actionLabel={t('followRequests.reload')} onAction={retry} busy={refreshing} /> : !items.length ? <AsyncStatePanel testID="follow-requests-empty" title={t('followRequests.emptyTitle')} message={t('followRequests.emptyBody')} /> : items.map(({ profile }) => {
      const displayName = profile.display_name || t('followRequests.readerFallback');
      return <View key={profile.id} style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('followRequests.openProfileA11y', { name: displayName })} onPress={() => router.push(`/user/${profile.id}`)}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={52} /></Pressable>
      <View style={styles.copy}><Text style={styles.name}>{displayName}</Text><Text style={styles.bio} numberOfLines={1}>{profile.bio || t('followRequests.requested')}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('followRequests.acceptA11y', { name: displayName })} style={styles.accept} onPress={() => void answer(profile.id, true)}><Text style={styles.acceptText}>{t('followRequests.accept')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={t('followRequests.ignoreA11y', { name: displayName })} style={styles.reject} onPress={() => void answer(profile.id, false)}><Text style={styles.rejectText}>{t('followRequests.ignore')}</Text></Pressable>
    </View>; })}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:10},row:{backgroundColor:'#fff',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},name:{fontWeight:'900',color:'#101828'},bio:{color:'#98a2b3',fontSize:12,marginTop:4},accept:{backgroundColor:'#c8211e',borderRadius:9,paddingHorizontal:13,paddingVertical:9},acceptText:{color:'#fff',fontWeight:'900'},reject:{paddingHorizontal:7,paddingVertical:9},rejectText:{color:'#667085',fontWeight:'800'}
});
