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
import { useI18n } from '../src/i18n/I18nProvider';

export default function MessagesScreen() {
  const { t } = useI18n();
  const unread = useUnreadCounts();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [id, rows] = await withUiTimeout(Promise.all([currentUserId(), listConversations()]), t('messages.timeout'), 16_000);
      setMe(id); setItems(rows); setError('');
      void unread.refresh().catch(() => undefined);
    }
    catch (e) { setError(e instanceof Error ? e.message : t('messages.loadFailed')); }
    finally { setLoading(false); setRefreshing(false); }
  }, [t, unread.refresh]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useForegroundRetry(Boolean(error), () => { setRefreshing(true); void load(); });

  const retry = () => { setRefreshing(true); void load(); };

  return <View style={styles.page}><Stack.Screen options={{ headerShown: true, title: t('messages.screenTitle'), headerBackTitle: t('common.back') }} />
    {loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="messages-loading" title={t('messages.loadingTitle')} message={t('messages.loadingBody')} busy /></View> : <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}>
      <View style={styles.note}><Text style={styles.noteTitle}>{t('messages.protectionTitle')}</Text><Text style={styles.noteText}>{t('messages.protectionBody')}</Text></View>
      {error ? <AsyncStatePanel testID="messages-error" tone="error" title={t('messages.unavailable')} message={error} actionLabel={t('messages.reload')} onAction={retry} busy={refreshing} /> : null}
      {!error && !items.length ? <AsyncStatePanel testID="messages-empty" title={t('messages.emptyTitle')} message={t('messages.emptyBody')} /> : null}
      {items.map((item) => {
        const incoming = item.status === 'pending' && item.recipient_user_id === me;
        const state = item.status === 'pending' ? t(incoming ? 'messages.pendingIncoming' : 'messages.pendingOutgoing') : item.status === 'accepted' ? '' : t(item.status === 'declined' ? 'messages.declined' : 'messages.ended');
        const partnerName = item.partner?.display_name || t('userProfile.readerFallback');
        return <Pressable accessibilityRole="button" accessibilityLabel={t(state ? 'messages.openChatStateA11y' : 'messages.openChatA11y', { name: partnerName, state })} key={item.id} style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
          <TrRbAvatar avatarKey={item.partner?.avatar_key} avatarPath={item.partner?.avatar_path} size={52} />
          <View style={styles.copy}><View style={styles.nameRow}><Text style={styles.name}>{partnerName}</Text>{state ? <Text style={incoming ? styles.request : styles.state}>{state}</Text> : null}</View><Text numberOfLines={1} style={styles.preview}>{item.latest_message?.body || t('messages.openChat')}</Text></View>
          {item.unread_count ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(item.unread_count, 99)}</Text></View> : null}
        </Pressable>;
      })}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},stateWrap:{flex:1,padding:14,justifyContent:'center'},list:{padding:14,paddingBottom:40,gap:10},note:{backgroundColor:'#fffaeb',borderRadius:14,padding:14,borderWidth:1,borderColor:'#fedf89'},noteTitle:{fontWeight:'900',color:'#7a2e0e'},noteText:{color:'#93370d',lineHeight:20,marginTop:4,fontSize:13},row:{backgroundColor:'#fff',borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#eaecf0'},copy:{flex:1},nameRow:{flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:16,fontWeight:'900',color:'#101828'},preview:{color:'#667085',marginTop:6},request:{backgroundColor:'#fef3f2',color:'#b42318',fontWeight:'900',fontSize:11,paddingHorizontal:7,paddingVertical:3,borderRadius:999},state:{color:'#98a2b3',fontSize:11,fontWeight:'800'},badge:{minWidth:22,height:22,borderRadius:11,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:6},badgeText:{color:'#fff',fontWeight:'900',fontSize:11}
});
