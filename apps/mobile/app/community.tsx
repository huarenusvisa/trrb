import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { CommunityCategory, CommunityPost, listCommunityPosts, toggleCommunityPostLike } from '../src/api/community';
import { supabase } from '../src/auth/supabase';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { optimisticCommunityPostLike, resolveCommunityPostLike } from '../src/community/community-post-like-state';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import { localeDateTag, type MessageKey } from '../src/i18n/i18n-core';
import { cacheCommunityFeed, readCachedCommunityFeed } from '../src/storage/communityFeedCache';
import { withUiTimeout } from '../src/utils/async-state-core';

const PAGE_SIZE = 20;

const categoryKeys: Record<CommunityCategory, MessageKey> = {
  hot_discussion: 'community.category.hotDiscussion',
  immigration_help: 'community.category.immigrationHelp',
  court_experience: 'community.category.courtExperience',
  uscis_interview: 'community.category.uscisInterview',
  ice_experience: 'community.category.iceExperience',
  lawyer_review: 'community.category.lawyerReview',
  tipoff: 'community.category.tipoff',
};

const categoryFilters: Array<CommunityCategory | ''> = ['', ...Object.keys(categoryKeys) as CommunityCategory[]];

export default function CommunityScreen() {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<CommunityPost[]>([]);
  const [category, setCategory] = useState<CommunityCategory | ''>('');
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
  const hydratedCaches = useRef(new Set<string>());
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const [{ data }, page] = await withUiTimeout(Promise.all([supabase.auth.getSession(), listCommunityPosts(0, PAGE_SIZE, category || undefined)]), t('community.timeout'), 16_000);
      if (sequence !== loadSequence.current) return;
      setSignedIn(Boolean(data.session));
      setItems(page.posts);
      setNextOffset(page.nextOffset);
      setPageError('');
      setShowingCached(false);
      setError('');
      void cacheCommunityFeed(page.posts, page.nextOffset, category).catch(() => undefined);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setError(e instanceof Error ? e.message : t('community.loadFailed'));
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category, t]);

  useFocusEffect(useCallback(() => {
    let active = true;
    const begin = async () => {
      if (!hydratedCaches.current.has(category)) {
        hydratedCaches.current.add(category);
        const cached = await readCachedCommunityFeed(category).catch(() => null);
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
      const page = await withUiTimeout(listCommunityPosts(nextOffset, PAGE_SIZE, category || undefined), t('community.pageTimeout'), 16_000);
      if (sequence !== loadSequence.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.posts.filter((item) => !known.has(item.id))];
      });
      setNextOffset(page.nextOffset);
    } catch (e) {
      if (sequence === loadSequence.current) setPageError(e instanceof Error ? e.message : t('community.pageFailed'));
    } finally {
      setLoadingMore(false);
    }
  };
  const selectCategory = (nextCategory: CommunityCategory | '') => {
    if (nextCategory === category) return;
    loadSequence.current += 1;
    setCategory(nextCategory);
    setItems([]);
    setNextOffset(null);
    setError('');
    setPageError('');
    setShowingCached(false);
    setLoading(true);
    setRefreshing(false);
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
      const result = await withUiTimeout(toggleCommunityPostLike(post.id, !post.viewer_has_liked), t('community.likeTimeout'));
      setItems((current) => current.map((item) => item.id === post.id ? resolveCommunityPostLike(item, result) : item));
    } catch (e) {
      setItems((current) => current.map((item) => item.id === post.id ? { ...item, ...previous } : item));
      setLikeError({ postId: post.id, message: e instanceof Error ? e.message : t('community.likeFailed') });
    } finally {
      setBusyLikeId('');
    }
  };

  return <View testID="community-screen" style={styles.page}>
    <Stack.Screen options={{ headerShown: true, title: t('community.screenTitle'), headerBackTitle: t('common.back') }} />
    <View style={styles.header}>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>TANG REN COMMUNITY</Text><Text style={styles.title}>{t('community.heading')}</Text></View>
      <Pressable testID="community-compose" accessibilityRole="button" style={styles.publish} onPress={compose}>
        <Text style={styles.publishText}>{signedIn ? t('community.publish') : t('community.signInToPost')}</Text>
      </Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
      {categoryFilters.map((filter) => {
        const selected = filter === category;
        const label = filter ? t(categoryKeys[filter]) : t('community.category.all');
        return <Pressable key={filter || 'all'} testID={`community-filter-${filter || 'all'}`} accessibilityRole="tab" accessibilityLabel={t('community.filterA11y', { category: label })} accessibilityState={{ selected }} style={[styles.filter, selected && styles.filterSelected]} onPress={() => selectCategory(filter)}><Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text></Pressable>;
      })}
    </ScrollView>
    {loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="community-loading" title={t('community.loadingTitle')} message={t('community.loadingBody')} busy /></View> :
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        {showingCached ? <View testID="community-offline-cache" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.cacheNotice}><Text style={styles.cacheNoticeText}>{t('community.cacheNotice')}</Text></View> : null}
        {error ? <AsyncStatePanel testID="community-error" tone="error" title={t('community.errorTitle')} message={error} actionLabel={t('community.reload')} onAction={retryCommunity} busy={refreshing} /> : null}
        {!error && items.length === 0 ? <AsyncStatePanel testID="community-empty" title={category ? t('community.emptyCategory', { category: t(categoryKeys[category]) }) : t('community.emptyAll')} message={t('community.emptyBody')} actionLabel={signedIn ? t('community.publishFirst') : t('community.signInToPost')} onAction={compose} /> : null}
        {items.map((post) => <Pressable testID={`community-post-${post.id}`} accessibilityRole="button" accessibilityLabel={t('community.openPostA11y', { title: post.title })} key={post.id} style={styles.card} onPress={() => router.push(`/community/${post.id}`)}>
          <View style={styles.metaRow}><Text style={styles.category}>{t(categoryKeys[post.category])}</Text><Text style={styles.time}>{new Date(post.created_at).toLocaleString(localeDateTag(locale))}</Text></View>
          <View style={styles.titleRow}><Text style={styles.postTitle}>{post.title}</Text>{post.status !== 'published' ? <Text style={styles.pending}>{t('community.pending')}</Text> : null}</View>
          <Text numberOfLines={5} style={styles.body}>{post.content}</Text>
          <View style={styles.footer}>
            <Pressable onPress={(event) => { event.stopPropagation(); router.push(`/user/${post.user_id}`); }}><Text style={styles.author}>{post.profiles?.display_name || t('community.userFallback')}</Text></Pressable>
            <View style={styles.engagement}>
              <Pressable
                testID={`community-list-like-${post.id}`}
                accessibilityRole="button"
                accessibilityLabel={signedIn ? t(post.viewer_has_liked ? 'community.unlikeA11y' : 'community.likeA11y', { count: post.like_count || 0 }) : t('community.signInToLike')}
                accessibilityState={{ disabled: Boolean(busyLikeId), selected: post.viewer_has_liked }}
                disabled={Boolean(busyLikeId)}
                style={[styles.likeButton, post.viewer_has_liked && styles.likedButton, busyLikeId && styles.disabled]}
                onPress={(event) => { event.stopPropagation(); void toggleLike(post); }}
              ><Text style={[styles.counts, post.viewer_has_liked && styles.likedCount]}>{busyLikeId === post.id ? t('community.processing') : t(post.viewer_has_liked ? 'community.likedCount' : 'community.likeCount', { count: post.like_count || 0 })}</Text></Pressable>
              <Text style={styles.counts}>{t('community.commentCount', { count: post.comment_count || 0 })}</Text>
            </View>
          </View>
          {likeError?.postId === post.id ? <View testID={`community-list-like-error-${post.id}`} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.likeError}><Text style={styles.likeErrorText}>{likeError.message}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('community.retryLikeA11y')} onPress={(event) => { event.stopPropagation(); void toggleLike(post); }}><Text style={styles.retryLike}>{t('community.retry')}</Text></Pressable></View> : null}
        </Pressable>)}
        {pageError ? <AsyncStatePanel testID="community-page-error" tone="error" title={t('community.pageErrorTitle')} message={pageError} actionLabel={t('community.retryPage')} onAction={() => void loadMore()} busy={loadingMore} /> : null}
        {!pageError && nextOffset !== null ? <Pressable testID="community-load-more" accessibilityRole="button" accessibilityLabel={loadingMore ? t('community.loadingMoreA11y') : t('community.loadMoreA11y')} accessibilityState={{ disabled: loadingMore || refreshing }} disabled={loadingMore || refreshing} style={[styles.loadMore, (loadingMore || refreshing) && styles.disabled]} onPress={() => void loadMore()}><Text style={styles.loadMoreText}>{loadingMore ? t('community.loadingMore') : t('community.loadMore')}</Text></Pressable> : null}
      </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},header:{backgroundColor:'#fff',padding:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:'#eaecf0'},headerCopy:{flex:1},eyebrow:{fontSize:11,fontWeight:'900',letterSpacing:1.2,color:'#c8211e'},title:{fontSize:24,fontWeight:'900',color:'#101828',marginTop:3},publish:{backgroundColor:'#c8211e',paddingHorizontal:14,paddingVertical:11,borderRadius:10},publishText:{color:'#fff',fontWeight:'800'},filters:{backgroundColor:'#fff',paddingHorizontal:14,paddingVertical:10,gap:8,borderBottomWidth:1,borderBottomColor:'#eaecf0'},filter:{minHeight:40,paddingHorizontal:14,alignItems:'center',justifyContent:'center',borderRadius:999,backgroundColor:'#f2f4f7'},filterSelected:{backgroundColor:'#c8211e'},filterText:{color:'#475467',fontWeight:'800'},filterTextSelected:{color:'#fff'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:12},cacheNotice:{backgroundColor:'#fffaeb',borderColor:'#fedf89',borderWidth:1,borderRadius:10,padding:11},cacheNoticeText:{color:'#93370d',fontWeight:'700'},card:{backgroundColor:'#fff',borderRadius:14,padding:16,borderWidth:1,borderColor:'#eaecf0'},metaRow:{flexDirection:'row',justifyContent:'space-between',gap:10},category:{color:'#c8211e',fontWeight:'900',fontSize:13},time:{color:'#98a2b3',fontSize:12},titleRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:9},postTitle:{flex:1,fontSize:19,lineHeight:26,fontWeight:'900',color:'#101828'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},body:{color:'#475467',lineHeight:22,marginTop:7},footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'#f2f4f7'},author:{color:'#344054',fontWeight:'800'},engagement:{flexDirection:'row',alignItems:'center',gap:10},likeButton:{minHeight:44,minWidth:58,paddingHorizontal:10,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:'#f2f4f7'},likedButton:{backgroundColor:'#fef3f2'},disabled:{opacity:.55},counts:{color:'#667085'},likedCount:{color:'#c8211e',fontWeight:'800'},likeError:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,backgroundColor:'#fef3f2',borderRadius:9,paddingHorizontal:10,paddingVertical:8,marginTop:8},likeErrorText:{flex:1,color:'#b42318',fontSize:13},retryLike:{color:'#b42318',fontWeight:'900',padding:6},loadMore:{minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderColor:'#d0d5dd',borderWidth:1,borderRadius:10},loadMoreText:{color:'#344054',fontWeight:'900'}
});
