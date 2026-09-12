import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../../src/components/TrRbAvatar';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { answerMessageRequest, createMessageRequest, ensureConversationWith, findConversationWith, getConversation, listMessages, markConversationRead, sendMessage, sendRichMessage, subscribeToConversation } from '../../src/social/messages';
import { MAX_MESSAGE_FILE_BYTES, removeMessageFile, uploadMessageFile } from '../../src/social/message-media';
import { currentUserId, loadSocialProfile } from '../../src/social/profiles';
import type { DirectConversation, DirectMessage, SocialProfile } from '../../src/social/types';
import { withUiTimeout } from '../../src/utils/async-state-core';
import { useUnreadCounts } from '../../src/notifications/UnreadProvider';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag } from '../../src/i18n/i18n-core';

const EMOJI = ['😀', '😂', '🥰', '👍', '🙏', '🎉', '❤️', '😢', '😮', '👏', '🤝', '🌹'];

function createCallRoomToken() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function VoiceBubble({ message, mine }: { message: DirectMessage; mine: boolean }) {
  const player = useAudioPlayer(message.attachment_url || null, { downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const seconds = Math.max(1, Math.round((message.attachment_duration_ms || 0) / 1000));
  return <Pressable accessibilityRole="button" disabled={!message.attachment_url} style={styles.voiceBubble} onPress={() => status.playing ? player.pause() : player.play()}><Text style={mine ? styles.mineText : styles.theirText}>{status.playing ? '❚❚' : '▶'}  {seconds}s</Text></Pressable>;
}

function MessageBody({ message, mine, open }: { message: DirectMessage; mine: boolean; open: (url: string) => void }) {
  const { t } = useI18n();
  const textStyle = mine ? styles.mineText : styles.theirText;
  if (message.message_type === 'image' && message.attachment_url) return <Pressable onPress={() => open(message.attachment_url!)}><Image source={{ uri: message.attachment_url }} contentFit="cover" style={styles.messageImage} /></Pressable>;
  if (message.message_type === 'audio') return <VoiceBubble message={message} mine={mine} />;
  if (message.message_type === 'video' || message.message_type === 'file') return <Pressable accessibilityRole="link" disabled={!message.attachment_url} onPress={() => message.attachment_url && open(message.attachment_url)}><Text style={textStyle}>{message.message_type === 'video' ? `▶ ${t('chat.videoAttachment')}` : `📄 ${message.attachment_name || t('chat.fileAttachment')}`}</Text></Pressable>;
  if (message.message_type === 'call') {
    const callUrl = typeof message.metadata?.url === 'string' ? message.metadata.url : '';
    return <Pressable accessibilityRole="link" disabled={!callUrl} onPress={() => callUrl && open(callUrl)}><Text style={textStyle}>{message.metadata?.mode === 'video' ? `📹 ${t('chat.videoCallInvite')}` : `☎️ ${t('chat.audioCallInvite')}`}{callUrl ? '  ›' : ''}</Text></Pressable>;
  }
  return <Text style={textStyle}>{message.body}</Text>;
}

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
  const [attachmentBusy, setAttachmentBusy] = useState<'media' | 'file' | 'audio' | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loadError, setLoadError] = useState('');
  const scroll = useRef<ScrollView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const load = useCallback(async () => {
    try {
      const result = await withUiTimeout((async () => {
        const userId = await currentUserId();
        let convo: DirectConversation | null = null; let nextPartner: SocialProfile;
        if (routeId === 'new') { nextPartner = await loadSocialProfile(targetUserId); convo = await findConversationWith(targetUserId); }
        else { const loaded = await getConversation(routeId); convo = loaded.conversation; nextPartner = loaded.partner; }
        const nextMessages = convo ? await listMessages(convo.id) : [];
        return { userId, convo, nextPartner, nextMessages };
      })(), t('chat.timeout'), 16_000);
      setMe(result.userId); setConversation(result.convo); setPartner(result.nextPartner); setMessages(result.nextMessages); setLoadError('');
      if (result.convo) { await markConversationRead(result.convo.id).catch(() => undefined); void unread.refresh().catch(() => undefined); }
    } catch (error) { setLoadError(error instanceof Error ? error.message : t('chat.loadFailed')); }
    finally { setLoading(false); }
  }, [routeId, t, targetUserId, unread.refresh]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (!conversation) return; const channel = subscribeToConversation(conversation.id, () => void load()); return () => { void channel.unsubscribe(); }; }, [conversation?.id, load]);
  useForegroundRetry(Boolean(loadError), () => void load());

  const afterSend = async () => { await load(); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); };
  const submit = async () => {
    const body = text.trim(); if (!body) return;
    setBusy(true);
    try { if (!conversation) setConversation(await createMessageRequest(targetUserId, body)); else await sendMessage(conversation.id, body); setText(''); setShowEmoji(false); await afterSend(); }
    catch (error) { Alert.alert(t('chat.sendFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); }
    finally { setBusy(false); }
  };
  const answer = async (accept: boolean) => { if (!conversation) return; setBusy(true); try { await answerMessageRequest(conversation.id, accept); await load(); } catch (error) { Alert.alert(t('chat.actionFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); } finally { setBusy(false); } };

  const conversationForUpload = async () => {
    if (conversation) return conversation;
    const created = await ensureConversationWith(targetUserId); setConversation(created); return created;
  };
  const sendAttachment = async (input: { uri: string; contentType: string; name?: string | null; size?: number | null; durationMs?: number | null; kind: 'image' | 'video' | 'file' | 'audio' }) => {
    if (input.size && input.size > MAX_MESSAGE_FILE_BYTES) throw new Error(t('chat.attachmentTooLarge'));
    const convo = await conversationForUpload();
    const uploaded = await uploadMessageFile({ conversationId: convo.id, uri: input.uri, contentType: input.contentType, fileName: input.name, knownSize: input.size });
    try {
      await sendRichMessage(convo.id, { body: input.kind === 'image' ? '[图片]' : input.kind === 'video' ? '[视频]' : input.kind === 'audio' ? '[语音]' : `[文件] ${input.name || ''}`, messageType: input.kind, attachmentPath: uploaded.path, attachmentName: input.name || null, attachmentMime: input.contentType, attachmentSize: uploaded.size, attachmentDurationMs: input.durationMs || null });
    } catch (error) { await removeMessageFile(convo.id, uploaded.path).catch(() => undefined); throw error; }
    await afterSend();
  };
  const pickMedia = async () => {
    setAttachmentBusy('media');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert(t('chat.mediaPermissionTitle'), t('chat.mediaPermissionBody'));
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false, quality: .9 });
      const asset = !result.canceled ? result.assets[0] : null;
      if (asset) await sendAttachment({ uri: asset.uri, contentType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'), name: asset.fileName, size: asset.fileSize, durationMs: asset.duration || null, kind: asset.type === 'video' ? 'video' : 'image' });
    } catch (error) { Alert.alert(t('chat.sendFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); }
    finally { setAttachmentBusy(null); }
  };
  const pickFile = async () => {
    setAttachmentBusy('file');
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ['application/pdf', 'text/plain', 'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] });
      const asset = !result.canceled ? result.assets[0] : null;
      if (asset) await sendAttachment({ uri: asset.uri, contentType: asset.mimeType || 'application/pdf', name: asset.name, size: asset.size, kind: 'file' });
    } catch (error) { Alert.alert(t('chat.sendFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); }
    finally { setAttachmentBusy(null); }
  };
  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      setAttachmentBusy('audio');
      try { await recorder.stop(); const status = recorder.getStatus(); if (!status.url) throw new Error(t('chat.recordingUnavailable')); await sendAttachment({ uri: status.url, contentType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', name: 'voice-message.m4a', durationMs: status.durationMillis, kind: 'audio' }); }
      catch (error) { Alert.alert(t('chat.sendFailed'), error instanceof Error ? error.message : t('chat.tryAgain')); }
      finally { setAttachmentBusy(null); await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined); }
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert(t('chat.recordPermissionTitle'), t('chat.recordPermissionBody'));
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); await recorder.prepareToRecordAsync(); recorder.record();
    } catch { Alert.alert(t('chat.actionFailed'), t('chat.tryAgain')); }
  };
  const startCall = (mode: 'audio' | 'video') => Alert.alert(t('chat.callConfirmTitle'), t('chat.callConfirmBody'), [{ text: t('comments.cancel'), style: 'cancel' }, { text: t('chat.startCall'), onPress: () => void (async () => {
    try {
      const convo = await conversationForUpload();
      const room = `TRRB-${createCallRoomToken()}`;
      const url = `https://meet.jit.si/${room}${mode === 'audio' ? '#config.startWithVideoMuted=true' : ''}`;
      await sendRichMessage(convo.id, { body: mode === 'video' ? '[视频通话邀请]' : '[语音通话邀请]', messageType: 'call', metadata: { mode, url } });
      await afterSend(); await Linking.openURL(url);
    } catch (error) { Alert.alert(t('chat.callUnavailable'), error instanceof Error ? error.message : t('chat.tryAgain')); }
  })() }]);
  const openUrl = (url: string) => { if (/^https:\/\//i.test(url)) void Linking.openURL(url).catch(() => Alert.alert(t('chat.actionFailed'), t('chat.tryAgain'))); };

  if (loading) return <View style={styles.statePage}><Stack.Screen options={{ headerShown: true, title: partner?.display_name || t('chat.screenTitle'), headerBackTitle: t('common.back') }} /><AsyncStatePanel testID="chat-loading" title={t('chat.loadingTitle')} message={t('chat.loadingBody')} busy /></View>;
  if (loadError && !partner) return <View style={styles.statePage}><Stack.Screen options={{ headerShown: true, title: t('chat.screenTitle'), headerBackTitle: t('common.back') }} /><AsyncStatePanel testID="chat-error" tone="error" title={t('chat.unavailable')} message={loadError} actionLabel={t('chat.reload')} onAction={() => { setLoading(true); void load(); }} /></View>;
  const incomingRequest = conversation?.status === 'pending' && conversation.recipient_user_id === me;
  const outgoingWaiting = conversation?.status === 'pending' && conversation.requester_user_id === me && messages.length > 0;
  const canCompose = !conversation || conversation.status === 'accepted' || (conversation.status === 'pending' && conversation.requester_user_id === me && messages.length === 0);
  const disabled = !canCompose || busy || attachmentBusy !== null || recorderState.isRecording;

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <Stack.Screen options={{ headerShown: true, title: partner?.display_name || t('chat.screenTitle'), headerBackTitle: t('common.back') }} />
    <Pressable testID="chat-partner-profile" accessibilityRole="button" accessibilityLabel={t('chat.openProfileA11y', { name: partner?.display_name || t('userProfile.readerFallback') })} disabled={!partner?.id} style={styles.partner} onPress={() => partner?.id && router.push(`/user/${partner.id}`)}><TrRbAvatar avatarKey={partner?.avatar_key} avatarPath={partner?.avatar_path} size={40} /><View style={styles.partnerCopy}><Text style={styles.partnerName}>{partner?.display_name || t('userProfile.readerFallback')}</Text><Text style={styles.partnerState}>{t(conversation?.status === 'accepted' ? 'chat.confirmed' : 'chat.strangerProtection')}</Text></View><Text style={styles.partnerChevron}>›</Text></Pressable>
    <View style={styles.toolbar}><Pressable testID="chat-audio-call" disabled={disabled} style={styles.tool} onPress={() => startCall('audio')}><Text style={styles.toolText}>☎ {t('chat.audioCall')}</Text></Pressable><Pressable testID="chat-video-call" disabled={disabled} style={styles.tool} onPress={() => startCall('video')}><Text style={styles.toolText}>▣ {t('chat.videoCall')}</Text></Pressable><Pressable testID="chat-share-media" disabled={disabled} style={styles.tool} onPress={() => void pickMedia()}><Text style={styles.toolText}>▧ {attachmentBusy === 'media' ? t('chat.uploading') : t('chat.sharePhotoVideo')}</Text></Pressable><Pressable testID="chat-share-file" disabled={disabled} style={styles.tool} onPress={() => void pickFile()}><Text style={styles.toolText}>▤ {attachmentBusy === 'file' ? t('chat.uploading') : t('chat.shareFile')}</Text></Pressable></View>
    {loadError ? <View style={styles.inlineError}><AsyncStatePanel testID="chat-refresh-error" tone="error" title={t('chat.refreshFailed')} message={loadError} actionLabel={t('chat.resync')} onAction={() => void load()} /></View> : null}
    {incomingRequest ? <View style={styles.request}><Text style={styles.requestTitle}>{t('chat.incomingTitle')}</Text><Text style={styles.requestText}>{t('chat.incomingBody')}</Text><View style={styles.requestActions}><Pressable disabled={busy} style={styles.accept} onPress={() => void answer(true)}><Text style={styles.acceptText}>{t('chat.accept')}</Text></Pressable><Pressable disabled={busy} style={styles.decline} onPress={() => void answer(false)}><Text style={styles.declineText}>{t('chat.ignore')}</Text></Pressable></View></View> : null}
    <ScrollView ref={scroll} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
      {!messages.length ? <View style={styles.safety}><Text style={styles.safetyTitle}>{t('chat.safetyTitle')}</Text><Text style={styles.safetyText}>{t('chat.safetyBody')}</Text></View> : null}
      {messages.map((message) => { const mine = message.sender_user_id === me; return <View key={message.id} style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirWrap]}><View style={[styles.bubble, mine ? styles.mine : styles.their]}><MessageBody message={message} mine={mine} open={openUrl} /></View><Text style={styles.time}>{new Date(message.created_at).toLocaleTimeString(localeDateTag(locale), { hour: '2-digit', minute: '2-digit' })}{mine && message.read_at ? ' · ✓✓' : ''}</Text></View>; })}
    </ScrollView>
    {outgoingWaiting ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.waiting')}</Text></View> : null}
    {conversation?.status === 'declined' ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.declined')}</Text></View> : null}
    {conversation?.status === 'blocked' ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.blocked')}</Text></View> : null}
    {canCompose && showEmoji ? <View style={styles.emojiTray}>{EMOJI.map((item) => <Pressable key={item} style={styles.emojiButton} onPress={() => setText((value) => value + item)}><Text style={styles.emojiText}>{item}</Text></Pressable>)}</View> : null}
    {canCompose ? <View style={styles.composer}><Pressable accessibilityLabel={t(recorderState.isRecording ? 'chat.stopRecording' : 'chat.voice')} disabled={busy || attachmentBusy !== null} style={[styles.roundButton, recorderState.isRecording && styles.recording]} onPress={() => void toggleRecording()}><Text>{recorderState.isRecording ? `■ ${Math.ceil(recorderState.durationMillis / 1000)}s` : '🎙'}</Text></Pressable><Pressable accessibilityLabel={t('chat.emoji')} style={styles.roundButton} onPress={() => setShowEmoji((value) => !value)}><Text>☺</Text></Pressable><TextInput accessibilityLabel={t('chat.messageA11y')} value={text} onChangeText={setText} maxLength={2000} multiline placeholder={t(conversation ? 'chat.inputPlaceholder' : 'chat.requestPlaceholder')} style={styles.input} /><Pressable accessibilityLabel={t('chat.sendA11y')} disabled={busy || !text.trim() || attachmentBusy !== null || recorderState.isRecording} style={[styles.send, (busy || !text.trim() || attachmentBusy !== null || recorderState.isRecording) && styles.disabled]} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>{t('chat.send')}</Text>}</Pressable></View> : null}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},statePage:{flex:1,justifyContent:'center',backgroundColor:'#f5f6f8',padding:14},inlineError:{padding:10},partner:{backgroundColor:'#fff',paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:'#eaecf0'},partnerCopy:{flex:1},partnerName:{fontWeight:'900',color:'#101828'},partnerState:{fontSize:11,color:'#98a2b3',marginTop:2},partnerChevron:{fontSize:26,color:'#98a2b3'},toolbar:{backgroundColor:'#fff',padding:8,flexDirection:'row',flexWrap:'wrap',gap:6,borderBottomWidth:1,borderBottomColor:'#eaecf0'},tool:{minHeight:38,borderRadius:10,backgroundColor:'#f2f4f7',paddingHorizontal:10,alignItems:'center',justifyContent:'center'},toolText:{color:'#344054',fontWeight:'800',fontSize:12},request:{backgroundColor:'#fffaeb',padding:14,borderBottomWidth:1,borderBottomColor:'#fedf89'},requestTitle:{fontWeight:'900',color:'#7a2e0e'},requestText:{color:'#93370d',fontSize:13,lineHeight:19,marginTop:4},requestActions:{flexDirection:'row',gap:9,marginTop:11},accept:{backgroundColor:'#c8211e',paddingHorizontal:16,paddingVertical:10,borderRadius:9},acceptText:{color:'#fff',fontWeight:'900'},decline:{borderWidth:1,borderColor:'#d0d5dd',paddingHorizontal:16,paddingVertical:10,borderRadius:9,backgroundColor:'#fff'},declineText:{color:'#475467',fontWeight:'900'},messages:{flex:1},messagesContent:{padding:14,paddingBottom:24},safety:{backgroundColor:'#fff',borderRadius:14,padding:18,alignItems:'center',marginVertical:16},safetyTitle:{fontWeight:'900',color:'#344054'},safetyText:{color:'#98a2b3',fontSize:13,lineHeight:19,textAlign:'center',marginTop:5},bubbleWrap:{marginBottom:12,maxWidth:'82%'},mineWrap:{alignSelf:'flex-end',alignItems:'flex-end'},theirWrap:{alignSelf:'flex-start',alignItems:'flex-start'},bubble:{borderRadius:16,paddingHorizontal:14,paddingVertical:10,overflow:'hidden'},mine:{backgroundColor:'#c8211e',borderBottomRightRadius:4},their:{backgroundColor:'#fff',borderBottomLeftRadius:4,borderWidth:1,borderColor:'#eaecf0'},mineText:{color:'#fff',fontSize:16,lineHeight:22},theirText:{color:'#101828',fontSize:16,lineHeight:22},messageImage:{width:220,height:180,borderRadius:10},voiceBubble:{minWidth:120,minHeight:34,justifyContent:'center'},time:{fontSize:10,color:'#98a2b3',marginTop:3},waiting:{backgroundColor:'#f2f4f7',padding:11},waitingText:{color:'#667085',fontSize:12,textAlign:'center'},emojiTray:{backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#eaecf0',padding:8,flexDirection:'row',flexWrap:'wrap'},emojiButton:{width:'16.66%',minHeight:42,alignItems:'center',justifyContent:'center'},emojiText:{fontSize:24},composer:{backgroundColor:'#fff',padding:8,flexDirection:'row',alignItems:'flex-end',gap:6,borderTopWidth:1,borderTopColor:'#eaecf0'},roundButton:{minWidth:38,height:42,borderRadius:12,backgroundColor:'#f2f4f7',alignItems:'center',justifyContent:'center'},recording:{backgroundColor:'#fee4e2'},input:{flex:1,maxHeight:110,minHeight:42,borderWidth:1,borderColor:'#d0d5dd',borderRadius:14,paddingHorizontal:11,paddingVertical:9,fontSize:16},send:{height:42,minWidth:60,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:12},disabled:{opacity:.45},sendText:{color:'#fff',fontWeight:'900'}});
