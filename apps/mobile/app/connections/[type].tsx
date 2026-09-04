import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { listFollowers, listFollowing } from '../../src/community/follows';
import { TrRbAvatar } from '../../src/components/TrRbAvatar';
import type { SocialProfile } from '../../src/social/types';

export default function ConnectionsScreen() {
  const { type, userId } = useLocalSearchParams<{ type: string; userId: string }>();
  const followers = type === 'followers';
  const [items, setItems] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setError(''); setItems(followers ? await listFollowers(String(userId || '')) : await listFollowing(String(userId || ''))); } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); } finally { setLoading(false); } }, [followers, userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: followers ? '粉丝' : '关注', headerBackTitle: '返回' }} />{loading ? <View style={styles.center}><ActivityIndicator color="#c8211e" /></View> : <ScrollView contentContainerStyle={styles.list}>
    {error ? <Text style={styles.error}>{error}</Text> : null}{!error && !items.length ? <Text style={styles.empty}>暂无{followers ? '粉丝' : '关注'}。</Text> : null}
    {items.map((profile) => <Pressable key={profile.id} style={styles.row} onPress={() => router.push(`/user/${profile.id}`)}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={50} /><View style={styles.copy}><Text style={styles.name}>{profile.display_name || '唐人读者'}</Text><Text style={styles.bio} numberOfLines={1}>{profile.bio || (profile.is_private ? '隐私账号' : '公开账号')}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},center:{flex:1,alignItems:'center',justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:9},row:{backgroundColor:'#fff',borderRadius:14,padding:13,flexDirection:'row',alignItems:'center',gap:11,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},name:{fontWeight:'900',color:'#101828'},bio:{fontSize:12,color:'#98a2b3',marginTop:4},chevron:{fontSize:26,color:'#98a2b3'},empty:{padding:30,textAlign:'center',color:'#98a2b3'},error:{backgroundColor:'#fef3f2',color:'#b42318',padding:14,borderRadius:12}});
