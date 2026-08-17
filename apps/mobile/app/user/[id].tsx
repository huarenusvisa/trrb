import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/auth/supabase';
import { followUser, getFollowCounts, isFollowing, listFollowers, listFollowing, PublicProfile, unfollowUser } from '../../src/community/follows';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id || '');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [followers, setFollowers] = useState<PublicProfile[]>([]);
  const [following, setFollowing] = useState<PublicProfile[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [followingTarget, setFollowingTarget] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: auth }, { data: p, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('id,display_name,avatar_key,status').eq('id', userId).single()
      ]);
      if (error) throw error;
      if (!p || p.status !== 'active') throw new Error('该用户当前不可访问');
      const current = auth.user?.id || null;
      setMe(current);
      setProfile(p as PublicProfile);
      const [nextCounts, nextFollowers, nextFollowing] = await Promise.all([
        getFollowCounts(userId), listFollowers(userId), listFollowing(userId)
      ]);
      setCounts(nextCounts); setFollowers(nextFollowers); setFollowing(nextFollowing);
      if (current && current !== userId) setFollowingTarget(await isFollowing(userId));
    } catch (e) {
      Alert.alert('无法加载用户', e instanceof Error ? e.message : '请稍后重试');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (userId) void load(); }, [userId]);

  const toggleFollow = async () => {
    if (!me) return Alert.alert('需要登录', '登录后才能关注用户。');
    setBusy(true);
    try {
      if (followingTarget) await unfollowUser(userId); else await followUser(userId);
      setFollowingTarget(!followingTarget);
      const next = await getFollowCounts(userId); setCounts(next);
    } catch (e) { Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!profile) return <View style={styles.center}><Text style={styles.muted}>该用户当前不可访问。</Text></View>;

  return <><Stack.Screen options={{ title: profile.display_name || '用户主页', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.name}>{profile.display_name || '唐人读者'}</Text>
    <View style={styles.counts}><Text style={styles.count}>{counts.followers} 粉丝</Text><Text style={styles.count}>{counts.following} 关注</Text></View>
    {me !== userId ? <Pressable style={followingTarget ? styles.outline : styles.primary} onPress={toggleFollow} disabled={busy}><Text style={followingTarget ? styles.outlineText : styles.primaryText}>{busy ? '处理中…' : followingTarget ? '取消关注' : '关注'}</Text></Pressable> : null}
    <Text style={styles.heading}>粉丝</Text>{followers.length ? followers.map((p) => <Text key={p.id} style={styles.person}>{p.display_name || '唐人读者'}</Text>) : <Text style={styles.muted}>暂无粉丝</Text>}
    <Text style={styles.heading}>关注</Text>{following.length ? following.map((p) => <Text key={p.id} style={styles.person}>{p.display_name || '唐人读者'}</Text>) : <Text style={styles.muted}>暂无关注</Text>}
  </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center'},name:{fontSize:28,fontWeight:'900',color:'#101828'},counts:{flexDirection:'row',gap:20,marginTop:12},count:{fontWeight:'800',color:'#475467'},primary:{marginTop:20,backgroundColor:'#c8211e',paddingVertical:12,borderRadius:10,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'800'},outline:{marginTop:20,borderWidth:1,borderColor:'#d0d5dd',paddingVertical:12,borderRadius:10,alignItems:'center'},outlineText:{color:'#344054',fontWeight:'800'},heading:{fontSize:20,fontWeight:'900',marginTop:28,marginBottom:10,color:'#101828'},person:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#f2f4f7',color:'#344054'},muted:{color:'#98a2b3'}});
