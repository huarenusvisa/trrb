import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import { listConversations } from '../src/social/messages';
import { currentUserId } from '../src/social/profiles';
import type { ConversationSummary } from '../src/social/types';

export default function MessagesScreen() {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setError(''); const [id, rows] = await Promise.all([currentUserId(), listConversations()]); setMe(id); setItems(rows); }
    catch (e) { setError(e instanceof Error ? e.message : '私信加载失败'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: '私信', headerBackTitle: '返回' }} />
    {loading ? <View style={styles.center}><ActivityIndicator color="#c8211e" /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <View style={styles.note}><Text style={styles.noteTitle}>陌生人消息保护已开启</Text><Text style={styles.noteText}>对方只能先发一条消息；你点击“确认聊天”后，双方才能继续回复。</Text></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && !items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>暂无私信</Text><Text style={styles.muted}>从其他用户的个人主页可以发起聊天。</Text></View> : null}
      {items.map((item) => {
        const incoming = item.status === 'pending' && item.recipient_user_id === me;
        const state = item.status === 'pending' ? (incoming ? '待你确认' : '等待对方确认') : item.status === 'accepted' ? '' : item.status === 'declined' ? '已拒绝' : '已结束';
        return <Pressable key={item.id} style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
          <TrRbAvatar avatarKey={item.partner?.avatar_key} avatarPath={item.partner?.avatar_path} size={52} />
          <View style={styles.copy}><View style={styles.nameRow}><Text style={styles.name}>{item.partner?.display_name || '唐人读者'}</Text>{state ? <Text style={incoming ? styles.request : styles.state}>{state}</Text> : null}</View><Text numberOfLines={1} style={styles.preview}>{item.latest_message?.body || '打开聊天'}</Text></View>
          {item.unread_count ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(item.unread_count, 99)}</Text></View> : null}
        </Pressable>;
      })}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},center:{flex:1,alignItems:'center',justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:10},note:{backgroundColor:'#fffaeb',borderRadius:14,padding:14,borderWidth:1,borderColor:'#fedf89'},noteTitle:{fontWeight:'900',color:'#7a2e0e'},noteText:{color:'#93370d',lineHeight:20,marginTop:4,fontSize:13},row:{backgroundColor:'#fff',borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},nameRow:{flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:16,fontWeight:'900',color:'#101828'},preview:{color:'#667085',marginTop:6},request:{backgroundColor:'#fef3f2',color:'#b42318',fontWeight:'900',fontSize:11,paddingHorizontal:7,paddingVertical:3,borderRadius:999},state:{color:'#98a2b3',fontSize:11,fontWeight:'800'},badge:{minWidth:22,height:22,borderRadius:11,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:6},badgeText:{color:'#fff',fontWeight:'900',fontSize:11},empty:{backgroundColor:'#fff',borderRadius:16,padding:32,alignItems:'center'},emptyTitle:{fontSize:18,fontWeight:'900',color:'#344054'},muted:{color:'#98a2b3',marginTop:6,textAlign:'center'},error:{backgroundColor:'#fef3f2',color:'#b42318',padding:14,borderRadius:12}
});
