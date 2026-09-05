import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { supabase } from '../src/auth/supabase';
import { listNotifications, markAllNotificationsRead, markNotificationRead, notificationCategories, notificationCategoryLabel, notificationLabel, notificationTarget, type NotificationCategory, type UserNotification } from '../src/community/notifications';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { cacheNotifications, readCachedNotifications } from '../src/storage/notificationCache';
import { withUiTimeout } from '../src/utils/async-state-core';
import { useUnreadCounts } from '../src/notifications/UnreadProvider';

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const unread = useUnreadCounts();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<NotificationCategory>('all');
  const [markingRead, setMarkingRead] = useState(false);
  const [error, setError] = useState('');
  const [viewerId, setViewerId] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const [showingCached, setShowingCached] = useState(false);
  const requestId = useRef(0);
  const hydratedCaches = useRef(new Set<string>());

  const load = useCallback(async (refresh = false, knownViewerId = '') => {
    const currentRequest = ++requestId.current;
    setLoadingMore(false);
    if (refresh) setRefreshing(true);
    else {
      setRefreshing(false);
      setLoading(true);
    }
    try {
      const page = await withUiTimeout(listNotifications(0, PAGE_SIZE, category), '消息读取超时，请检查网络后重试。');
      if (currentRequest === requestId.current) {
        setItems(page.notifications);
        setNextOffset(page.nextOffset);
        setPageError('');
        setShowingCached(false);
        setError('');
        if (knownViewerId) void cacheNotifications(page.notifications, page.nextOffset, knownViewerId, category).catch(() => undefined);
      }
    }
    catch (e) { if (currentRequest === requestId.current) setError(e instanceof Error ? e.message : '消息加载失败'); }
    finally {
      if (currentRequest === requestId.current) refresh ? setRefreshing(false) : setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    let active = true;
    const begin = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) throw new Error('需要登录');
        if (!active) return;
        setViewerId(userId);
        const cacheScope = `${userId}:${category}`;
        let cached = null;
        if (!hydratedCaches.current.has(cacheScope)) {
          hydratedCaches.current.add(cacheScope);
          cached = await readCachedNotifications(userId, category).catch(() => null);
        }
        if (!active) return;
        if (cached?.notifications.length) {
          setItems(cached.notifications);
          setNextOffset(cached.nextOffset);
          setShowingCached(true);
          setLoading(false);
          await load(true, userId);
        } else await load(false, userId);
      } catch {
        if (active) await load(false);
      }
    };
    void begin();
    return () => { active = false; requestId.current += 1; };
  }, [category, load]);
  useForegroundRetry(Boolean(error), () => void load(true, viewerId));

  const cacheVisibleItems = (nextItems: UserNotification[]) => {
    if (!viewerId) return;
    const cachedNextOffset = nextItems.length > PAGE_SIZE ? PAGE_SIZE : nextOffset;
    void cacheNotifications(nextItems, cachedNextOffset, viewerId, category).catch(() => undefined);
  };

  const selectCategory = (nextCategory: NotificationCategory) => {
    if (nextCategory === category || markingRead) return;
    requestId.current += 1;
    setCategory(nextCategory);
    setItems([]);
    setNextOffset(null);
    setLoadingMore(false);
    setError('');
    setPageError('');
    setShowingCached(false);
    setLoading(true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (nextOffset === null || loadingMore || refreshing) return;
    const currentRequest = requestId.current;
    setLoadingMore(true);
    setPageError('');
    try {
      const page = await withUiTimeout(listNotifications(nextOffset, PAGE_SIZE, category), '较早消息读取超时，请检查网络后重试。');
      if (currentRequest !== requestId.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.notifications.filter((item) => !known.has(item.id))];
      });
      setNextOffset(page.nextOffset);
    } catch (e) {
      if (currentRequest === requestId.current) setPageError(e instanceof Error ? e.message : '较早消息读取失败');
    } finally {
      if (currentRequest === requestId.current) setLoadingMore(false);
    }
  };

  const openItem = async (item: UserNotification) => {
    try {
      if (!item.is_read) {
        await markNotificationRead(item.id);
        const nextItems = items.map(x => x.id === item.id ? { ...x, is_read: true } : x);
        setItems(nextItems);
        cacheVisibleItems(nextItems);
        unread.markNotificationReadLocally();
      }
      const target = notificationTarget(item);
      if (target) router.push(target as never);
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试。');
    }
  };

  const markAll = async () => {
    if (markingRead) return;
    const unreadCount = items.filter((item) => !item.is_read).length;
    setMarkingRead(true);
    try {
      await withUiTimeout(markAllNotificationsRead(category), '标记已读超时，请检查网络后重试。');
      const nextItems = items.map(x => ({ ...x, is_read: true }));
      setItems(nextItems);
      cacheVisibleItems(nextItems);
      category === 'all' ? unread.markAllNotificationsReadLocally() : unread.markNotificationsReadLocally(unreadCount);
      void unread.refresh().catch((refreshError) => console.warn('unread count sync failed', refreshError));
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试。');
    } finally { setMarkingRead(false); }
  };

  return <><Stack.Screen options={{ title: '消息中心', headerBackTitle: '返回' }} />
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true, viewerId)} />}>
      <View style={styles.header}><Text style={styles.h1}>消息中心</Text>{items.some(item => !item.is_read) ? <Pressable disabled={markingRead} accessibilityRole="button" accessibilityLabel={category === 'all' ? '将全部消息标为已读' : `将${notificationCategoryLabel(category)}消息标为已读`} onPress={() => void markAll()}><Text style={[styles.markAll, markingRead && styles.disabled]}>{markingRead ? '处理中…' : category === 'all' ? '全部已读' : '本类已读'}</Text></Pressable> : null}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
        {notificationCategories.map((item) => <Pressable key={item.key} disabled={markingRead} testID={`notification-filter-${item.key}`} accessibilityRole="tab" accessibilityState={{ selected: category === item.key, disabled: markingRead }} accessibilityLabel={`筛选${item.label}通知`} style={[styles.filter, category === item.key && styles.filterSelected, markingRead && styles.disabled]} onPress={() => selectCategory(item.key)}><Text style={[styles.filterText, category === item.key && styles.filterTextSelected]}>{item.label}</Text></Pressable>)}
      </ScrollView>
      {showingCached ? <View testID="notifications-offline-cache" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.cacheNotice}><Text style={styles.cacheNoticeText}>正在显示此账号上次读取的消息，并尝试同步最新内容。</Text></View> : null}
      {loading ? <AsyncStatePanel testID="notifications-loading" title="正在读取消息" message="正在同步回复、关注和系统通知。" busy /> : error && items.length === 0 ? <AsyncStatePanel testID="notifications-error" tone="error" title="消息暂时无法读取" message={error} actionLabel="重新读取" onAction={() => void load(true, viewerId)} busy={refreshing} /> : <>
      {error ? <AsyncStatePanel testID="notifications-refresh-error" tone="error" title="最新消息同步失败" message={error} actionLabel="重新同步" onAction={() => void load(true, viewerId)} busy={refreshing} /> : null}
      {!error && items.length === 0 ? <AsyncStatePanel testID="notifications-empty" title={category === 'all' ? '暂时没有新消息' : `暂无${notificationCategoryLabel(category)}消息`} message={category === 'all' ? '收到回复、关注、聊天申请或系统通知后，会显示在这里。' : '此分类收到新消息后，会显示在这里。'} /> : items.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`打开消息：${item.title || notificationLabel(item.type)}`} key={item.id} style={[styles.card, !item.is_read && styles.unread]} onPress={() => void openItem(item)}>
        <View style={styles.row}><Text style={styles.title}>{item.title || notificationLabel(item.type)}</Text>{!item.is_read ? <View style={styles.dot} /> : null}</View>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text>
      </Pressable>)}
      {pageError ? <AsyncStatePanel testID="notifications-page-error" tone="error" title="较早消息暂时无法读取" message={pageError} actionLabel="重试加载" onAction={() => void loadMore()} busy={loadingMore} /> : null}
      {!pageError && nextOffset !== null ? <Pressable testID="notifications-load-more" accessibilityRole="button" accessibilityLabel={loadingMore ? '正在加载较早消息' : '加载更多消息'} accessibilityState={{ disabled: loadingMore || refreshing }} disabled={loadingMore || refreshing} style={[styles.loadMore, (loadingMore || refreshing) && styles.disabled]} onPress={() => void loadMore()}><Text style={styles.loadMoreText}>{loadingMore ? '正在加载…' : '加载更多消息'}</Text></Pressable> : null}
      </>}
    </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingBottom:48},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8,marginBottom:14},h1:{fontSize:28,fontWeight:'900',color:'#101828'},markAll:{color:'#c8211e',fontWeight:'800'},disabled:{opacity:.55},filters:{gap:8,paddingBottom:14},filter:{minHeight:40,justifyContent:'center',paddingHorizontal:15,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd'},filterSelected:{backgroundColor:'#c8211e',borderColor:'#c8211e'},filterText:{color:'#344054',fontWeight:'700'},filterTextSelected:{color:'#fff'},cacheNotice:{backgroundColor:'#fffaeb',borderColor:'#fedf89',borderWidth:1,borderRadius:10,padding:11,marginBottom:10},cacheNoticeText:{color:'#93370d',fontWeight:'700'},card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:10,borderWidth:1,borderColor:'#eaecf0'},unread:{borderColor:'#f04438',backgroundColor:'#fff8f7'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},title:{fontSize:17,fontWeight:'800',color:'#101828',flex:1},dot:{width:9,height:9,borderRadius:9,backgroundColor:'#c8211e'},body:{color:'#475467',marginTop:6,lineHeight:21},time:{color:'#98a2b3',fontSize:12,marginTop:10},loadMore:{minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderColor:'#d0d5dd',borderWidth:1,borderRadius:10},loadMoreText:{color:'#344054',fontWeight:'900'}});
