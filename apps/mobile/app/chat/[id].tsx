import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../../src/components/TrRbAvatar';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { answerMessageRequest, createMessageRequest, findConversationWith, getConversation, listMessages, markConversationRead, sendMessage, subscribeToConversation } from '../../src/social/messages';
import { currentUserId, loadSocialProfile } from '../../src/social/profiles';
import type { DirectConversation, DirectMessage, SocialProfile } from '../../src/social/types';
import { withUiTimeout } from '../../src/utils/async-state-core';
import { useUnreadCounts } from '../../src/notifications/UnreadProvider';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag } from '../../src/i18n/i18n-core';

export default function ChatScreen() {
  const { locale, t } = useI18n();
  const unread = useUnreadCounts();
  const params = useLocalSearchParams<{ id: string; userId?: string }>();
  const routeId = String(params.id || '');
  const targetUserId = String(params.userId || '');
  const [me, setMe] = useState('');
  const [conversation, setConversation] = useState<DirectConversation | null>(null);
  const [partner, setPartner] = useState<SocialProfile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const result = await withUiTimeout((async () => {
        const userId = await currentUserId();
        let convo: DirectConversation | null = null; let nextPartner: SocialProfile;
        if (routeId === 'new') {
          nextPartner = await loadSocialProfile(targetUserId);
          convo = await findConversationWith(targetUserId);
        } else {
          const loaded = await getConversation(routeId); convo = loaded.conversation; nextPartner = loaded.partner;
        }
        const nextMessages = convo ? await listMessages(convo.id) : [];
        return { userId, convo, nextPartner, nextMessages };
      })(), t('chat.timeout'), 16_000);
      setMe(result.userId); setConversation(result.convo); setPartner(result.nextPartner); setMessages(result.nextMessages); setLoadError('');
      if (result.convo) {
        await markConversationRead(result.convo.id).catch(() => undefined);
        void unread.refresh().catch(() => undefined);
      }
    } catch (error) { setLoadError(error instanceof Error ? error.message : t('chat.loadFailed')); }
    finally { setLoading(false); }
  }, [routeId, t, targetUserId, unread.refresh]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!conversation) return;
    const channel = subscribeToConversation(conversation.id, () => void load());
    return () => { void channel.unsubscribe(); };
  }, [conversation?.id, load]);
  useForegroundRetry(Boolean(loadError), () => void load());

  const retryLoad = () => { setLoading(true); void load(); };

  const submit = async () => {
    const body = text.trim(); if (!body) return;
    setBusy(true);
    try {
      if (!conversation) {
        const created = await createMessageRequest(targetUserId, body); setConversation(created);
      } else await sendMessage(conversation.id, body);
      setText(''); await load();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    } catch (error) { Alert.alert(t('chat.sendFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); }
    finally { setBusy(false); }
  };

  const answer = async (accept: boolean) => {
    if (!conversation) return;
    setBusy(true);
    try { await answerMessageRequest(conversation.id, accept); await load(); }
    catch (error) { Alert.alert(t('chat.actionFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.statePage}><Stack.Screen options={{ headerShown: true, title: partner?.display_name || t('chat.screenTitle'), headerBackTitle: t('common.back') }} /><AsyncStatePanel testID="chat-loading" title={t('chat.loadingTitle')} message={t('chat.loadingBody')} busy /></View>;
  if (loadError && !partner) return <View style={styles.statePage}><Stack.Screen options={{ headerShown: true, title: t('chat.screenTitle'), headerBackTitle: t('common.back') }} /><AsyncStatePanel testID="chat-error" tone="error" title={t('chat.unavailable')} message={loadError} actionLabel={t('chat.reload')} onAction={retryLoad} /></View>;
  const incomingRequest = conversation?.status === 'pending' && conversation.recipient_user_id === me;
  const outgoingWaiting = conversation?.status === 'pending' && conversation.requester_user_id === me && messages.length > 0;
  const canCompose = !conversation || conversation.status === 'accepted' || (conversation.status === 'pending' && conversation.requester_user_id === me && messages.length === 0);

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <Stack.Screen options={{ headerShown: true, title: partner?.display_name || t('chat.screenTitle'), headerBackTitle: t('common.back') }} />
    <View style={styles.partner}><TrRbAvatar avatarKey={partner?.avatar_key} avatarPath={partner?.avatar_path} size={40} /><View><Text style={styles.partnerName}>{partner?.display_name || t('userProfile.readerFallback')}</Text><Text style={styles.partnerState}>{t(conversation?.status === 'accepted' ? 'chat.confirmed' : 'chat.strangerProtection')}</Text></View></View>
    {loadError ? <View style={styles.inlineError}><AsyncStatePanel testID="chat-refresh-error" tone="error" title={t('chat.refreshFailed')} message={loadError} actionLabel={t('chat.resync')} onAction={() => void load()} /></View> : null}
    {incomingRequest ? <View style={styles.request}><Text style={styles.requestTitle}>{t('chat.incomingTitle')}</Text><Text style={styles.requestText}>{t('chat.incomingBody')}</Text><View style={styles.requestActions}><Pressable accessibilityRole="button" disabled={busy} style={styles.accept} onPress={() => void answer(true)}><Text style={styles.acceptText}>{t('chat.accept')}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={styles.decline} onPress={() => void answer(false)}><Text style={styles.declineText}>{t('chat.ignore')}</Text></Pressable></View></View> : null}
    <ScrollView ref={scroll} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
      {!messages.length ? <View style={styles.safety}><Text style={styles.safetyTitle}>{t('chat.safetyTitle')}</Text><Text style={styles.safetyText}>{t('chat.safetyBody')}</Text></View> : null}
      {messages.map((message) => { const mine = message.sender_user_id === me; return <View key={message.id} style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirWrap]}><View style={[styles.bubble, mine ? styles.mine : styles.their]}><Text style={mine ? styles.mineText : styles.theirText}>{message.body}</Text></View><Text style={styles.time}>{new Date(message.created_at).toLocaleTimeString(localeDateTag(locale), { hour: '2-digit', minute: '2-digit' })}</Text></View>; })}
    </ScrollView>
    {outgoingWaiting ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.waiting')}</Text></View> : null}
    {conversation?.status === 'declined' ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.declined')}</Text></View> : null}
    {conversation?.status === 'blocked' ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.blocked')}</Text></View> : null}
    {canCompose ? <View style={styles.composer}><TextInput accessibilityLabel={t('chat.messageA11y')} value={text} onChangeText={setText} maxLength={2000} multiline placeholder={t(conversation ? 'chat.inputPlaceholder' : 'chat.requestPlaceholder')} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel={t('chat.sendA11y')} disabled={busy || !text.trim()} style={[styles.send, (busy || !text.trim()) && styles.disabled]} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>{t('chat.send')}</Text>}</Pressable></View> : null}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},statePage:{flex:1,justifyContent:'center',backgroundColor:'#f5f6f8',padding:14},inlineError:{padding:10,backgroundColor:'#f5f6f8'},partner:{backgroundColor:'#fff',paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:'#eaecf0'},partnerName:{fontWeight:'900',color:'#101828'},partnerState:{fontSize:11,color:'#98a2b3',marginTop:2},request:{backgroundColor:'#fffaeb',padding:14,borderBottomWidth:1,borderBottomColor:'#fedf89'},requestTitle:{fontWeight:'900',color:'#7a2e0e'},requestText:{color:'#93370d',fontSize:13,lineHeight:19,marginTop:4},requestActions:{flexDirection:'row',gap:9,marginTop:11},accept:{backgroundColor:'#c8211e',paddingHorizontal:16,paddingVertical:10,borderRadius:9},acceptText:{color:'#fff',fontWeight:'900'},decline:{borderWidth:1,borderColor:'#d0d5dd',paddingHorizontal:16,paddingVertical:10,borderRadius:9,backgroundColor:'#fff'},declineText:{color:'#475467',fontWeight:'900'},messages:{flex:1},messagesContent:{padding:14,paddingBottom:24},safety:{backgroundColor:'#fff',borderRadius:14,padding:18,alignItems:'center',marginVertical:16},safetyTitle:{fontWeight:'900',color:'#344054'},safetyText:{color:'#98a2b3',fontSize:13,lineHeight:19,textAlign:'center',marginTop:5},bubbleWrap:{marginBottom:12,maxWidth:'82%'},mineWrap:{alignSelf:'flex-end',alignItems:'flex-end'},theirWrap:{alignSelf:'flex-start',alignItems:'flex-start'},bubble:{borderRadius:16,paddingHorizontal:14,paddingVertical:10},mine:{backgroundColor:'#c8211e',borderBottomRightRadius:4},their:{backgroundColor:'#fff',borderBottomLeftRadius:4,borderWidth:1,borderColor:'#eaecf0'},mineText:{color:'#fff',fontSize:16,lineHeight:22},theirText:{color:'#101828',fontSize:16,lineHeight:22},time:{fontSize:10,color:'#98a2b3',marginTop:3},waiting:{backgroundColor:'#f2f4f7',padding:11},waitingText:{color:'#667085',fontSize:12,textAlign:'center'},composer:{backgroundColor:'#fff',padding:10,flexDirection:'row',alignItems:'flex-end',gap:8,borderTopWidth:1,borderTopColor:'#eaecf0'},input:{flex:1,maxHeight:110,minHeight:42,borderWidth:1,borderColor:'#d0d5dd',borderRadius:14,paddingHorizontal:12,paddingVertical:10,fontSize:16},send:{height:42,minWidth:64,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:14},disabled:{opacity:.45},sendText:{color:'#fff',fontWeight:'900'}
});
