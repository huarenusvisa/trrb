import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/auth/supabase';
import { followStatus, followUser, getFollowCounts, unfollowUser } from '../../src/community/follows';
import { ProfileHero } from '../../src/components/ProfileHero';
import { ProfilePostList } from '../../src/components/ProfilePostList';
import { blockUser, isUserBlocked, unblockUser } from '../../src/social/blocks';
import { findConversationWith } from '../../src/social/messages';
import { listProfilePosts } from '../../src/social/posts';
import { loadSocialProfile } from '../../src/social/profiles';
import type { FollowStatus, ProfilePost, SocialProfile } from '../../src/social/types';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id || '');
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [relation, setRelation] = useState<FollowStatus>('none');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const current = auth.user?.id || null;
      setMe(current);
      if (current === userId) { router.replace('/(tabs)/profile'); return; }
      const blockedByMe = current ? await isUserBlocked(userId) : false;
      setBlocked(blockedByMe);
      if (blockedByMe) { setProfile(null); return; }
      const nextProfile = await loadSocialProfile(userId);
      setProfile(nextProfile);
      const [nextCounts, nextPosts, nextRelation] = await Promise.all([
        getFollowCounts(userId), listProfilePosts(userId), current ? followStatus(userId) : Promise.resolve<FollowStatus>('none'),
      ]);
      setCounts(nextCounts); setPosts(nextPosts); setRelation(nextRelation);
    } catch (error) {
      Alert.alert('无法加载用户', error instanceof Error ? error.message : '请稍后重试');
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) void load(); }, [load, userId]);

  const toggleFollow = async () => {
    if (!me) return router.push('/auth');
    setBusy(true);
    try {
      if (relation === 'none') setRelation(await followUser(userId));
      else { await unfollowUser(userId); setRelation('none'); }
      setCounts(await getFollowCounts(userId));
    } catch (error) { Alert.alert('操作失败', error instanceof Error ? error.message : '请稍后重试'); }
    finally { setBusy(false); }
  };

  const openChat = async () => {
    if (!me) return router.push('/auth');
    try {
      const existing = await findConversationWith(userId);
      if (existing) router.push(`/chat/${existing.id}`);
      else router.push({ pathname: '/chat/new', params: { userId } });
    } catch (error) { Alert.alert('无法打开私信', error instanceof Error ? error.message : '请稍后重试'); }
  };

  const confirmBlock = () => Alert.alert('拉黑这个用户？', '双方关注会解除，对方也不能再向你发送消息。', [
    { text: '取消', style: 'cancel' },
    { text: '确认拉黑', style: 'destructive', onPress: async () => {
      try { await blockUser(userId); setBlocked(true); setProfile(null); setPosts([]); }
      catch (error) { Alert.alert('拉黑失败', error instanceof Error ? error.message : '请稍后重试'); }
    } },
  ]);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  if (blocked) return <><Stack.Screen options={{ headerShown: true, title: '用户主页', headerBackTitle: '返回' }} /><View style={styles.center}><Text style={styles.blockTitle}>已拉黑该用户</Text><Text style={styles.muted}>对方无法关注你或向你发送私信。</Text><Pressable style={styles.outlineSolo} onPress={async () => { await unblockUser(userId); setBlocked(false); void load(); }}><Text style={styles.outlineText}>解除拉黑</Text></Pressable></View></>;
  if (!profile) return <View style={styles.center}><Text style={styles.muted}>该用户当前不可访问。</Text></View>;
  const locked = profile.is_private && relation !== 'accepted';

  return <><Stack.Screen options={{ headerShown: true, title: profile.display_name || '用户主页', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <ProfileHero profile={profile} followers={counts.followers} following={counts.following} onFollowers={() => router.push({ pathname: '/connections/followers', params: { userId } })} onFollowing={() => router.push({ pathname: '/connections/following', params: { userId } })} actions={<>
      <Pressable style={[styles.primary, relation !== 'none' && styles.outline]} onPress={() => void toggleFollow()} disabled={busy}><Text style={relation === 'none' ? styles.primaryText : styles.outlineText}>{busy ? '处理中…' : relation === 'accepted' ? '已关注' : relation === 'pending' ? '已申请' : profile.is_private ? '申请关注' : '关注'}</Text></Pressable>
      <Pressable style={styles.outline} onPress={() => void openChat()}><Text style={styles.outlineText}>发私信</Text></Pressable>
      <Pressable style={styles.more} onPress={confirmBlock}><Text style={styles.moreText}>•••</Text></Pressable>
    </>} />
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>主页动态</Text><Text style={styles.sectionMeta}>{posts.length} 条</Text></View>
    {locked ? <View style={styles.locked}><Text style={styles.lockIcon}>🔒</Text><Text style={styles.lockTitle}>这是隐私账号</Text><Text style={styles.muted}>关注申请通过后，才能查看对方发布的图片和视频。</Text></View> : <ProfilePostList posts={posts} />}
  </ScrollView></>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:14,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:'#f5f6f8'},primary:{flex:1,backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},outline:{flex:1,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff',borderRadius:10,paddingVertical:11,alignItems:'center'},outlineSolo:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingHorizontal:22,paddingVertical:12,marginTop:18},outlineText:{color:'#344054',fontWeight:'900'},more:{width:46,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,alignItems:'center',justifyContent:'center'},moreText:{color:'#475467',fontWeight:'900'},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:22,marginBottom:10,paddingHorizontal:3},sectionTitle:{fontSize:20,fontWeight:'900',color:'#101828'},sectionMeta:{color:'#98a2b3'},locked:{backgroundColor:'#fff',borderRadius:16,padding:32,alignItems:'center',borderWidth:1,borderColor:'#eaecf0'},lockIcon:{fontSize:28},lockTitle:{fontSize:18,fontWeight:'900',color:'#344054',marginTop:9,marginBottom:5},blockTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:8},muted:{color:'#98a2b3',textAlign:'center',lineHeight:21}
});
