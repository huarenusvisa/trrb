import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { CommunityPost, listCommunityPosts } from '../src/api/community';
import { supabase } from '../src/auth/supabase';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { withUiTimeout } from '../src/utils/async-state-core';

const categoryNames: Record<string, string> = {
  hot_discussion: '热门讨论',
  immigration_help: '移民互助',
  court_experience: '上庭交流',
  uscis_interview: 'USCIS 面谈',
  ice_experience: 'ICE 经历',
  lawyer_review: '律师点评',
  tipoff: '投稿爆料',
};

export default function CommunityScreen() {
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data }, posts] = await withUiTimeout(Promise.all([supabase.auth.getSession(), listCommunityPosts()]), '社区读取超时，请检查网络后重试。', 16_000);
      setSignedIn(Boolean(data.session));
      setItems(posts);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '社区加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });

  const retryCommunity = () => { setRefreshing(true); void load(); };
  const compose = () => router.push(signedIn ? '/community-compose' : '/auth');

  return <View testID="community-screen" style={styles.page}>
    <Stack.Screen options={{ headerShown: true, title: '移民社区', headerBackTitle: '返回' }} />
    <View style={styles.header}>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>TANG REN COMMUNITY</Text><Text style={styles.title}>真实经历，彼此互助</Text></View>
      <Pressable testID="community-compose" accessibilityRole="button" style={styles.publish} onPress={compose}>
        <Text style={styles.publishText}>{signedIn ? '发布帖子' : '登录后发帖'}</Text>
      </Pressable>
    </View>
    {loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="community-loading" title="正在读取社区" message="正在同步最新公开帖子。" busy /></View> :
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        {error ? <AsyncStatePanel testID="community-error" tone="error" title="社区暂时无法读取" message={error} actionLabel="重新读取" onAction={retryCommunity} busy={refreshing} /> : null}
        {!error && items.length === 0 ? <AsyncStatePanel testID="community-empty" title="暂时还没有公开帖子" message="可以发布真实经历、提出问题，或分享移民与上庭经验。" actionLabel={signedIn ? '发布第一篇' : '登录后发帖'} onAction={compose} /> : null}
        {items.map((post) => <Pressable testID={`community-post-${post.id}`} accessibilityRole="button" accessibilityLabel={`打开帖子：${post.title}`} key={post.id} style={styles.card} onPress={() => router.push(`/community/${post.id}`)}>
          <View style={styles.metaRow}><Text style={styles.category}>{categoryNames[post.category] || post.category}</Text><Text style={styles.time}>{new Date(post.created_at).toLocaleString('zh-CN')}</Text></View>
          <View style={styles.titleRow}><Text style={styles.postTitle}>{post.title}</Text>{post.status !== 'published' ? <Text style={styles.pending}>审核中</Text> : null}</View>
          <Text numberOfLines={5} style={styles.body}>{post.content}</Text>
          <View style={styles.footer}><Pressable onPress={(event) => { event.stopPropagation(); router.push(`/user/${post.user_id}`); }}><Text style={styles.author}>{post.profiles?.display_name || '唐人用户'}</Text></Pressable><Text style={styles.counts}>赞 {post.like_count || 0} · 评论 {post.comment_count || 0}</Text></View>
        </Pressable>)}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},header:{backgroundColor:'#fff',padding:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:'#eaecf0'},headerCopy:{flex:1},eyebrow:{fontSize:11,fontWeight:'900',letterSpacing:1.2,color:'#c8211e'},title:{fontSize:24,fontWeight:'900',color:'#101828',marginTop:3},publish:{backgroundColor:'#c8211e',paddingHorizontal:14,paddingVertical:11,borderRadius:10},publishText:{color:'#fff',fontWeight:'800'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:12},card:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#eaecf0'},metaRow:{flexDirection:'row',justifyContent:'space-between',gap:10},category:{color:'#c8211e',fontWeight:'900',fontSize:13},time:{color:'#98a2b3',fontSize:12},titleRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:9},postTitle:{flex:1,fontSize:19,lineHeight:26,fontWeight:'900',color:'#101828'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},body:{color:'#475467',lineHeight:22,marginTop:7},footer:{flexDirection:'row',justifyContent:'space-between',marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'#f2f4f7'},author:{color:'#344054',fontWeight:'800'},counts:{color:'#667085'}
});
