import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { listFollowers, listFollowing } from '../../src/community/follows';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../../src/components/TrRbAvatar';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import type { SocialProfile } from '../../src/social/types';
import { withUiTimeout } from '../../src/utils/async-state-core';
import { useI18n } from '../../src/i18n/I18nProvider';

export default function ConnectionsScreen() {
  const { t } = useI18n();
  const { type, userId } = useLocalSearchParams<{ type: string; userId: string }>();
  const followers = type === 'followers';
  const [items, setItems] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const target = String(userId || '');
      if (!target) throw new Error(t('connections.missingUser'));
      setItems(await withUiTimeout(followers ? listFollowers(target) : listFollowing(target), t(followers ? 'connections.followersTimeout' : 'connections.followingTimeout')));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : t('connections.loadFailed')); }
    finally { setLoading(false); setRefreshing(false); }
  }, [followers, t, userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });
  const retry = () => { setRefreshing(true); void load(); };
  const listKey = followers ? 'connections.followers' : 'connections.following';
  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: t(listKey), headerBackTitle: t('common.back') }} />{loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="connections-loading" title={t(followers ? 'connections.loadingFollowers' : 'connections.loadingFollowing')} message={t('connections.loadingBody')} busy /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}>
    {error ? <AsyncStatePanel testID="connections-error" tone="error" title={t(followers ? 'connections.followersUnavailable' : 'connections.followingUnavailable')} message={error} actionLabel={t('connections.reload')} onAction={retry} busy={refreshing} /> : null}{!error && !items.length ? <AsyncStatePanel testID="connections-empty" title={t(followers ? 'connections.noFollowers' : 'connections.noFollowing')} message={t(followers ? 'connections.noFollowersBody' : 'connections.noFollowingBody')} /> : null}
    {items.map((profile) => <Pressable accessibilityRole="button" accessibilityLabel={t('connections.openProfileA11y', { name: profile.display_name || t('userProfile.readerFallback') })} key={profile.id} style={styles.row} onPress={() => router.push(`/user/${profile.id}`)}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={50} /><View style={styles.copy}><Text style={styles.name}>{profile.display_name || t('userProfile.readerFallback')}</Text><Text style={styles.bio} numberOfLines={1}>{profile.bio || t(profile.is_private ? 'userProfile.privateAccount' : 'userProfile.publicAccount')}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:9},row:{backgroundColor:'#fff',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:11,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},name:{fontWeight:'900',color:'#101828'},bio:{fontSize:12,color:'#98a2b3',marginTop:4},chevron:{fontSize:26,color:'#98a2b3'}});
