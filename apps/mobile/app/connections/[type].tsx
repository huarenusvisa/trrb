import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { listFollowers, listFollowing } from '../../src/community/follows';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../../src/components/TrRbAvatar';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import type { SocialProfile } from '../../src/social/types';
import { withUiTimeout } from '../../src/utils/async-state-core';

export default function ConnectionsScreen() {
  const { type, userId } = useLocalSearchParams<{ type: string; userId: string }>();
  const followers = type === 'followers';
  const [items, setItems] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const target = String(userId || '');
      if (!target) throw new Error('缺少用户资料，请返回后重新打开。');
      setItems(await withUiTimeout(followers ? listFollowers(target) : listFollowing(target), `${followers ? '粉丝' : '关注'}读取超时，请检查网络后重试。`));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [followers, userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });
  const retry = () => { setRefreshing(true); void load(); };
  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: followers ? '粉丝' : '关注', headerBackTitle: '返回' }} />{loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="connections-loading" title={`正在读取${followers ? '粉丝' : '关注'}`} message="正在同步最新账户关系。" busy /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}>
    {error ? <AsyncStatePanel testID="connections-error" tone="error" title={`${followers ? '粉丝' : '关注'}暂时无法读取`} message={error} actionLabel="重新读取" onAction={retry} busy={refreshing} /> : null}{!error && !items.length ? <AsyncStatePanel testID="connections-empty" title={`暂无${followers ? '粉丝' : '关注'}`} message={followers ? '新粉丝和已通过的关注申请会显示在这里。' : '打开其他用户主页即可关注对方。'} /> : null}
    {items.map((profile) => <Pressable accessibilityRole="button" accessibilityLabel={`打开${profile.display_name || '唐人读者'}的个人主页`} key={profile.id} style={styles.row} onPress={() => router.push(`/user/${profile.id}`)}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={50} /><View style={styles.copy}><Text style={styles.name}>{profile.display_name || '唐人读者'}</Text><Text style={styles.bio} numberOfLines={1}>{profile.bio || (profile.is_private ? '隐私账号' : '公开账号')}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:9},row:{backgroundColor:'#fff',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:11,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},name:{fontWeight:'900',color:'#101828'},bio:{fontSize:12,color:'#98a2b3',marginTop:4},chevron:{fontSize:26,color:'#98a2b3'}});
