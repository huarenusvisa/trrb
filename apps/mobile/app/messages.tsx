import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { listConversations } from '../src/social/messages';
import { currentUserId } from '../src/social/profiles';
import type { ConversationSummary } from '../src/social/types';
import { withUiTimeout } from '../src/utils/async-state-core';
import { useUnreadCounts } from '../src/notifications/UnreadProvider';

export default function MessagesScreen() {
  const unread = useUnreadCounts();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [id, rows] = await withUiTimeout(Promise.all([currentUserId(), listConversations()]), '私信读取超时，请检查网络后重试。', 16_000);
      setMe(id); setItems(rows); setError('');
      void unread.refresh().catch(() => undefined);
    }
    catch (e) { setError(e instanceof Error ? e.message : '私信加载失败'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [unread.refresh]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });

  const retry = () => { setRefreshing(true); void load(); };

  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: '私信', headerBackTitle: '返回' }} />
    {loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="messages-loading" title="正在读取私信" message="正在同步聊天和待确认申请。" busy /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}>
      <View style={styles.note}><Text style={styles.noteTitle}>陌生人消息保护已开启</Text><Text style={styles.noteText}>对方只能先发一条消息；你点击“确认聊天”后，双方才能继续回复。</Text></View>
      {error ? <AsyncStatePanel testID="messages-error" tone="error" title="私信暂时无法读取" message={error} actionLabel="重新读取" onAction={retry} busy={refreshing} /> : null}
      {!error && !items.length ? <AsyncStatePanel testID="messages-empty" title="暂无私信" message="从其他用户的个人主页可以发起聊天；对方确认前只能发送第一条消息。" /> : null}
      {items.map((item) => {
        const incoming = item.status === 'pending' && item.recipient_user_id === me;
        const state = item.status === 'pending' ? (incoming ? '待你确认' : '等待对方确认') : item.status === 'accepted' ? '' : item.status === 'declined' ? '已拒绝' : '已结束';
        return <Pressable accessibilityRole="button" accessibilityLabel={`打开与${item.partner?.display_name || '唐人读者'}的聊天${state ? `，${state}` : ''}`} key={item.id} style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
          <TrRbAvatar avatarKey={item.partner?.avatar_key} avatarPath={item.partner?.avatar_path} size={52} />
          <View style={styles.copy}><View style={styles.nameRow}><Text style={styles.name}>{item.partner?.display_name || '唐人读者'}</Text>{state ? <Text style={incoming ? styles.request : styles.state}>{state}</Text> : null}</View><Text numberOfLines={1} style={styles.preview}>{item.latest_message?.body || '打开聊天'}</Text></View>
          {item.unread_count ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(item.unread_count, 99)}</Text></View> : null}
        </Pressable>;
      })}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:10},note:{backgroundColor:'#fffaeb',borderRadius:14,padding:14,borderWidth:1,borderColor:'#fedf89'},noteTitle:{fontWeight:'900',color:'#7a2e0e'},noteText:{color:'#93370d',lineHeight:20,marginTop:4,fontSize:13},row:{backgroundColor:'#fff',borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},nameRow:{flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:16,fontWeight:'900',color:'#101828'},preview:{color:'#667085',marginTop:6},request:{backgroundColor:'#fef3f2',color:'#b42318',fontWeight:'900',fontSize:11,paddingHorizontal:7,paddingVertical:3,borderRadius:999},state:{color:'#98a2b3',fontSize:11,fontWeight:'800'},badge:{minWidth:22,height:22,borderRadius:11,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:6},badgeText:{color:'#fff',fontWeight:'900',fontSize:11}
});
