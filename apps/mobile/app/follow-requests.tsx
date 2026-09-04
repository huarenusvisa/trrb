import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { answerFollowRequest, listFollowRequests } from '../src/community/follows';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import type { SocialProfile } from '../src/social/types';
import { withUiTimeout } from '../src/utils/async-state-core';

type Request = { profile: SocialProfile; created_at: string };

export default function FollowRequestsScreen() {
  const [items, setItems] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setItems(await withUiTimeout(listFollowRequests(), '关注申请读取超时，请检查网络后重试。')); setError(''); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : '关注申请加载失败'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });
  const retry = () => { setRefreshing(true); void load(); };
  const answer = async (id: string, accept: boolean) => { try { await answerFollowRequest(id, accept); setItems((rows) => rows.filter((row) => row.profile.id !== id)); } catch (error) { Alert.alert('操作失败', error instanceof Error ? error.message : '请稍后重试'); } };
  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: '关注申请', headerBackTitle: '返回' }} />{loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="follow-requests-loading" title="正在读取关注申请" message="正在同步隐私账号的待处理申请。" busy /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}>
    {error ? <AsyncStatePanel testID="follow-requests-error" tone="error" title="关注申请暂时无法读取" message={error} actionLabel="重新读取" onAction={retry} busy={refreshing} /> : !items.length ? <AsyncStatePanel testID="follow-requests-empty" title="暂无待处理申请" message="隐私账号收到的新关注会显示在这里。" /> : items.map(({ profile }) => <View key={profile.id} style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`打开${profile.display_name || '唐人读者'}的个人主页`} onPress={() => router.push(`/user/${profile.id}`)}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={52} /></Pressable>
      <View style={styles.copy}><Text style={styles.name}>{profile.display_name || '唐人读者'}</Text><Text style={styles.bio} numberOfLines={1}>{profile.bio || '申请关注你'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`同意${profile.display_name || '该用户'}的关注申请`} style={styles.accept} onPress={() => void answer(profile.id, true)}><Text style={styles.acceptText}>同意</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`忽略${profile.display_name || '该用户'}的关注申请`} style={styles.reject} onPress={() => void answer(profile.id, false)}><Text style={styles.rejectText}>忽略</Text></Pressable>
    </View>)}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:10},row:{backgroundColor:'#fff',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},name:{fontWeight:'900',color:'#101828'},bio:{color:'#98a2b3',fontSize:12,marginTop:4},accept:{backgroundColor:'#c8211e',borderRadius:9,paddingHorizontal:13,paddingVertical:9},acceptText:{color:'#fff',fontWeight:'900'},reject:{paddingHorizontal:7,paddingVertical:9},rejectText:{color:'#667085',fontWeight:'800'}
});
