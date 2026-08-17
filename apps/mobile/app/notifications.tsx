import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { listNotifications, markAllNotificationsRead, markNotificationRead, notificationLabel, notificationTarget, UserNotification } from '../src/community/notifications';

export default function NotificationsScreen() {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setItems(await listNotifications()); }
    catch (e) { setError(e instanceof Error ? e.message : '消息加载失败'); }
    finally { refresh ? setRefreshing(false) : setLoading(false); }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const openItem = async (item: UserNotification) => {
    if (!item.is_read) {
      await markNotificationRead(item.id);
      setItems(old => old.map(x => x.id === item.id ? { ...x, is_read: true } : x));
    }
    const target = notificationTarget(item);
    if (target) router.push(target as never);
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    setItems(old => old.map(x => ({ ...x, is_read: true })));
  };

  return <><Stack.Screen options={{ title: '消息中心', headerBackTitle: '返回' }} />
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
      <View style={styles.header}><Text style={styles.h1}>消息中心</Text><Pressable onPress={() => void markAll()}><Text style={styles.markAll}>全部已读</Text></Pressable></View>
      {loading ? <ActivityIndicator style={styles.loader} /> : error ? <Text style={styles.error}>{error}</Text> : items.length === 0 ? <Text style={styles.empty}>暂时没有新消息。</Text> : items.map(item => <Pressable key={item.id} style={[styles.card, !item.is_read && styles.unread]} onPress={() => void openItem(item)}>
        <View style={styles.row}><Text style={styles.title}>{item.title || notificationLabel(item.type)}</Text>{!item.is_read ? <View style={styles.dot} /> : null}</View>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
        <Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text>
      </Pressable>)}
    </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingBottom:48},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8,marginBottom:14},h1:{fontSize:28,fontWeight:'900',color:'#101828'},markAll:{color:'#c8211e',fontWeight:'800'},loader:{marginTop:36},error:{color:'#b42318',padding:18,textAlign:'center'},empty:{color:'#667085',padding:28,textAlign:'center'},card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:10,borderWidth:1,borderColor:'#eaecf0'},unread:{borderColor:'#f04438',backgroundColor:'#fff8f7'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},title:{fontSize:17,fontWeight:'800',color:'#101828',flex:1},dot:{width:9,height:9,borderRadius:9,backgroundColor:'#c8211e'},body:{color:'#475467',marginTop:6,lineHeight:21},time:{color:'#98a2b3',fontSize:12,marginTop:10}});
