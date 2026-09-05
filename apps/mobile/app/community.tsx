import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { CommunityPost, listCommunityPosts, toggleCommunityPostLike } from '../src/api/community';
import { supabase } from '../src/auth/supabase';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { optimisticCommunityPostLike, resolveCommunityPostLike } from '../src/community/community-post-like-state';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { cacheCommunityFeed, readCachedCommunityFeed } from '../src/storage/communityFeedCache';
import { withUiTimeout } from '../src/utils/async-state-core';

const PAGE_SIZE = 20;

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
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const [showingCached, setShowingCached] = useState(false);
  const [busyLikeId, setBusyLikeId] = useState('');
  const [likeError, setLikeError] = useState<{ postId: string; message: string } | null>(null);
  const hydratedCache = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const [{ data }, page] = await withUiTimeout(Promise.all([supabase.auth.getSession(), listCommunityPosts(0, PAGE_SIZE)]), '社区读取超时，请检查网络后重试。', 16_000);
      if (sequence !== loadSequence.current) return;
      setSignedIn(Boolean(data.session));
      setItems(page.posts);
      setNextOffset(page.nextOffset);
      setPageError('');
      setShowingCached(false);
      setError('');
      void cacheCommunityFeed(page.posts, page.nextOffset).catch(() => undefined);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setError(e instanceof Error ? e.message : '社区加载失败');
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const begin = async () => {
      if (!hydratedCache.current) {
        hydratedCache.current = true;
        const cached = await readCachedCommunityFeed().catch(() => null);
        if (active && cached?.posts.length) {
          setItems((current) => current.length ? current : cached.posts);
          setNextOffset(cached.nextOffset);
          setShowingCached(true);
          setLoading(false);
        }
      }
      if (active) {
        setRefreshing(true);
        void load();
      }
    };
    void begin();
    return () => { active = false; loadSequence.current += 1; };
  }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });

  const retryCommunity = () => { setRefreshing(true); setPageError(''); void load(); };
  const loadMore = async () => {
    if (nextOffset === null || loadingMore || refreshing) return;
    const sequence = loadSequence.current;
    setLoadingMore(true);
    setPageError('');
    try {
      const page = await withUiTimeout(listCommunityPosts(nextOffset, PAGE_SIZE), '较早帖子读取超时，请检查网络后重试。', 16_000);
      if (sequence !== loadSequence.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.posts.filter((item) => !known.has(item.id))];
      });
      setNextOffset(page.nextOffset);
    } catch (e) {
      if (sequence === loadSequence.current) setPageError(e instanceof Error ? e.message : '较早帖子读取失败');
    } finally {
      setLoadingMore(false);
    }
  };
  const compose = () => router.push(signedIn ? '/community-compose' : '/auth');
  const toggleLike = async (post: CommunityPost) => {
    if (!signedIn) { router.push('/auth'); return; }
    if (busyLikeId) return;
    const previous = { like_count: post.like_count, viewer_has_liked: post.viewer_has_liked };
    setBusyLikeId(post.id);
    setLikeError(null);
    setItems((current) => current.map((item) => item.id === post.id ? optimisticCommunityPostLike(item) : item));
    try {
      const result = await withUiTimeout(toggleCommunityPostLike(post.id, !post.viewer_has_liked), '点赞操作超时，请检查网络后重试。');
      setItems((current) => current.map((item) => item.id === post.id ? resolveCommunityPostLike(item, result) : item));
    } catch (e) {
      setItems((current) => current.map((item) => item.id === post.id ? { ...item, ...previous } : item));
      setLikeError({ postId: post.id, message: e instanceof Error ? e.message : '点赞操作失败，请重试。' });
    } finally {
      setBusyLikeId('');
    }
  };

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
        {showingCached ? <View testID="community-offline-cache" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.cacheNotice}><Text style={styles.cacheNoticeText}>正在显示上次读取的公开帖子，并尝试同步最新内容。</Text></View> : null}
        {error ? <AsyncStatePanel testID="community-error" tone="error" title="社区暂时无法读取" message={error} actionLabel="重新读取" onAction={retryCommunity} busy={refreshing} /> : null}
        {!error && items.length === 0 ? <AsyncStatePanel testID="community-empty" title="暂时还没有公开帖子" message="可以发布真实经历、提出问题，或分享移民与上庭经验。" actionLabel={signedIn ? '发布第一篇' : '登录后发帖'} onAction={compose} /> : null}
        {items.map((post) => <Pressable testID={`community-post-${post.id}`} accessibilityRole="button" accessibilityLabel={`打开帖子：${post.title}`} key={post.id} style={styles.card} onPress={() => router.push(`/community/${post.id}`)}>
          <View style={styles.metaRow}><Text style={styles.category}>{categoryNames[post.category] || post.category}</Text><Text style={styles.time}>{new Date(post.created_at).toLocaleString('zh-CN')}</Text></View>
          <View style={styles.titleRow}><Text style={styles.postTitle}>{post.title}</Text>{post.status !== 'published' ? <Text style={styles.pending}>审核中</Text> : null}</View>
          <Text numberOfLines={5} style={styles.body}>{post.content}</Text>
          <View style={styles.footer}>
            <Pressable onPress={(event) => { event.stopPropagation(); router.push(`/user/${post.user_id}`); }}><Text style={styles.author}>{post.profiles?.display_name || '唐人用户'}</Text></Pressable>
            <View style={styles.engagement}>
              <Pressable
                testID={`community-list-like-${post.id}`}
                accessibilityRole="button"
                accessibilityLabel={signedIn ? `${post.viewer_has_liked ? '取消点赞' : '点赞'}，当前${post.like_count || 0}个赞` : '登录后点赞'}
                accessibilityState={{ disabled: Boolean(busyLikeId), selected: post.viewer_has_liked }}
                disabled={Boolean(busyLikeId)}
                style={[styles.likeButton, post.viewer_has_liked && styles.likedButton, busyLikeId && styles.disabled]}
                onPress={(event) => { event.stopPropagation(); void toggleLike(post); }}
              ><Text style={[styles.counts, post.viewer_has_liked && styles.likedCount]}>{busyLikeId === post.id ? '处理中…' : `${post.viewer_has_liked ? '已赞' : '赞'} ${post.like_count || 0}`}</Text></Pressable>
              <Text style={styles.counts}>评论 {post.comment_count || 0}</Text>
            </View>
          </View>
          {likeError?.postId === post.id ? <View testID={`community-list-like-error-${post.id}`} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.likeError}><Text style={styles.likeErrorText}>{likeError.message}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试点赞操作" onPress={(event) => { event.stopPropagation(); void toggleLike(post); }}><Text style={styles.retryLike}>重试</Text></Pressable></View> : null}
        </Pressable>)}
        {pageError ? <AsyncStatePanel testID="community-page-error" tone="error" title="较早帖子暂时无法读取" message={pageError} actionLabel="重试加载" onAction={() => void loadMore()} busy={loadingMore} /> : null}
        {!pageError && nextOffset !== null ? <Pressable testID="community-load-more" accessibilityRole="button" accessibilityLabel={loadingMore ? '正在加载较早帖子' : '加载更多社区帖子'} accessibilityState={{ disabled: loadingMore || refreshing }} disabled={loadingMore || refreshing} style={[styles.loadMore, (loadingMore || refreshing) && styles.disabled]} onPress={() => void loadMore()}><Text style={styles.loadMoreText}>{loadingMore ? '正在加载…' : '加载更多帖子'}</Text></Pressable> : null}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},header:{backgroundColor:'#fff',padding:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:'#eaecf0'},headerCopy:{flex:1},eyebrow:{fontSize:11,fontWeight:'900',letterSpacing:1.2,color:'#c8211e'},title:{fontSize:24,fontWeight:'900',color:'#101828',marginTop:3},publish:{backgroundColor:'#c8211e',paddingHorizontal:14,paddingVertical:11,borderRadius:10},publishText:{color:'#fff',fontWeight:'800'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:12},cacheNotice:{backgroundColor:'#fffaeb',borderColor:'#fedf89',borderWidth:1,borderRadius:10,padding:11},cacheNoticeText:{color:'#93370d',fontWeight:'700'},card:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#eaecf0'},metaRow:{flexDirection:'row',justifyContent:'space-between',gap:10},category:{color:'#c8211e',fontWeight:'900',fontSize:13},time:{color:'#98a2b3',fontSize:12},titleRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:9},postTitle:{flex:1,fontSize:19,lineHeight:26,fontWeight:'900',color:'#101828'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},body:{color:'#475467',lineHeight:22,marginTop:7},footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'#f2f4f7'},author:{color:'#344054',fontWeight:'800'},engagement:{flexDirection:'row',alignItems:'center',gap:10},likeButton:{minHeight:44,minWidth:58,paddingHorizontal:10,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:'#f2f4f7'},likedButton:{backgroundColor:'#fef3f2'},disabled:{opacity:.55},counts:{color:'#667085'},likedCount:{color:'#c8211e',fontWeight:'800'},likeError:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,backgroundColor:'#fef3f2',borderRadius:9,paddingHorizontal:10,paddingVertical:8,marginTop:8},likeErrorText:{flex:1,color:'#b42318',fontSize:13},retryLike:{color:'#b42318',fontWeight:'900',padding:6},loadMore:{minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderColor:'#d0d5dd',borderWidth:1,borderRadius:10},loadMoreText:{color:'#344054',fontWeight:'900'}
});
