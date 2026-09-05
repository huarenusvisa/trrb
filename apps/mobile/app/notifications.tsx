import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { listNotifications, markAllNotificationsRead, markNotificationRead, notificationLabel, notificationTarget, UserNotification } from '../src/community/notifications';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { withUiTimeout } from '../src/utils/async-state-core';
import { useUnreadCounts } from '../src/notifications/UnreadProvider';

export default function NotificationsScreen() {
  const unread = useUnreadCounts();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setItems(await withUiTimeout(listNotifications(), '消息读取超时，请检查网络后重试。'));
      setError('');
    }
    catch (e) { setError(e instanceof Error ? e.message : '消息加载失败'); }
    finally { refresh ? setRefreshing(false) : setLoading(false); }
  }, []);

  useEffect(() => { void load(false); }, [load]);
  useForegroundRetry(Boolean(error), () => void load(true));

  const openItem = async (item: UserNotification) => {
    try {
      if (!item.is_read) {
        await markNotificationRead(item.id);
        setItems(old => old.map(x => x.id === item.id ? { ...x, is_read: true } : x));
        unread.markNotificationReadLocally();
      }
      const target = notificationTarget(item);
      if (target) router.push(target as never);
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试。');
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems(old => old.map(x => ({ ...x, is_read: true })));
      unread.markAllNotificationsReadLocally();
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试。');
    }
  };

  return <><Stack.Screen options={{ title: '消息中心', headerBackTitle: '返回' }} />
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
      <View style={styles.header}><Text style={styles.h1}>消息中心</Text>{items.some(item => !item.is_read) ? <Pressable accessibilityRole="button" accessibilityLabel="将全部消息标为已读" onPress={() => void markAll()}><Text style={styles.markAll}>全部已读</Text></Pressable> : null}</View>
      {loading ? <AsyncStatePanel testID="notifications-loading" title="正在读取消息" message="正在同步回复、关注和系统通知。" busy /> : error ? <AsyncStatePanel testID="notifications-error" tone="error" title="消息暂时无法读取" message={error} actionLabel="重新读取" onAction={() => void load(true)} busy={refreshing} /> : items.length === 0 ? <AsyncStatePanel testID="notifications-empty" title="暂时没有新消息" message="收到回复、关注、聊天申请或系统通知后，会显示在这里。" /> : items.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`打开消息：${item.title || notificationLabel(item.type)}`} key={item.id} style={[styles.card, !item.is_read && styles.unread]} onPress={() => void openItem(item)}>
        <View style={styles.row}><Text style={styles.title}>{item.title || notificationLabel(item.type)}</Text>{!item.is_read ? <View style={styles.dot} /> : null}</View>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text>
      </Pressable>)}
    </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingBottom:48},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8,marginBottom:14},h1:{fontSize:28,fontWeight:'900',color:'#101828'},markAll:{color:'#c8211e',fontWeight:'800'},card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:10,borderWidth:1,borderColor:'#eaecf0'},unread:{borderColor:'#f04438',backgroundColor:'#fff8f7'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},title:{fontSize:17,fontWeight:'800',color:'#101828',flex:1},dot:{width:9,height:9,borderRadius:9,backgroundColor:'#c8211e'},body:{color:'#475467',marginTop:6,lineHeight:21},time:{color:'#98a2b3',fontSize:12,marginTop:10}});
