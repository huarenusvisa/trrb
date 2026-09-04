import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { answerFollowRequest, listFollowRequests } from '../src/community/follows';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import type { SocialProfile } from '../src/social/types';

type Request = { profile: SocialProfile; created_at: string };

export default function FollowRequestsScreen() {
  const [items, setItems] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setItems(await listFollowRequests()); } catch (error) { Alert.alert('加载失败', error instanceof Error ? error.message : '请稍后重试'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const answer = async (id: string, accept: boolean) => { try { await answerFollowRequest(id, accept); setItems((rows) => rows.filter((row) => row.profile.id !== id)); } catch (error) { Alert.alert('操作失败', error instanceof Error ? error.message : '请稍后重试'); } };
  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: '关注申请', headerBackTitle: '返回' }} />{loading ? <View style={styles.center}><ActivityIndicator color="#c8211e" /></View> : <ScrollView contentContainerStyle={styles.list}>
    {!items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>暂无待处理申请</Text><Text style={styles.muted}>隐私账号收到的新关注会显示在这里。</Text></View> : items.map(({ profile }) => <View key={profile.id} style={styles.row}>
      <Pressable onPress={() => router.push(`/user/${profile.id}`)}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={52} /></Pressable>
      <View style={styles.copy}><Text style={styles.name}>{profile.display_name || '唐人读者'}</Text><Text style={styles.bio} numberOfLines={1}>{profile.bio || '申请关注你'}</Text></View>
      <Pressable style={styles.accept} onPress={() => void answer(profile.id, true)}><Text style={styles.acceptText}>同意</Text></Pressable><Pressable style={styles.reject} onPress={() => void answer(profile.id, false)}><Text style={styles.rejectText}>忽略</Text></Pressable>
    </View>)}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},center:{flex:1,alignItems:'center',justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:10},row:{backgroundColor:'#fff',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},name:{fontWeight:'900',color:'#101828'},bio:{color:'#98a2b3',fontSize:12,marginTop:4},accept:{backgroundColor:'#c8211e',borderRadius:9,paddingHorizontal:13,paddingVertical:9},acceptText:{color:'#fff',fontWeight:'900'},reject:{paddingHorizontal:7,paddingVertical:9},rejectText:{color:'#667085',fontWeight:'800'},empty:{backgroundColor:'#fff',borderRadius:16,padding:32,alignItems:'center'},emptyTitle:{fontSize:18,fontWeight:'900',color:'#344054'},muted:{color:'#98a2b3',marginTop:6,textAlign:'center'}
});
