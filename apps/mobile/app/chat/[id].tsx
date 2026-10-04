import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoldToTalk } from '../../src/components/HoldToTalk';
import { ChatCallView } from '../../src/components/ChatCallView';
import { callRoomFromUrl, chatDateLabel } from '../../src/social/chat-interaction-core';
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

type AttachmentInput = { uri: string; contentType: string; name?: string | null; size?: number | null; durationMs?: number | null; kind: 'image' | 'video' | 'file' | 'audio' };
function VideoBubble({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.messageImage} />;
}

function VoiceBubble({ message, mine }: { message: DirectMessage; mine: boolean }) {
  const player = useAudioPlayer(message.attachment_url || null, { downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const seconds = Math.max(1, Math.round((message.attachment_duration_ms || 0) / 1000));
  return <Pressable accessibilityRole="button" disabled={!message.attachment_url} style={styles.voiceBubble} onPress={() => status.playing ? player.pause() : void (async () => { if (status.didJustFinish) await player.seekTo(0); player.play(); })()}><Text style={mine ? styles.mineText : styles.theirText}>{status.playing ? '❚❚' : '▶'}  {seconds}s</Text></Pressable>;
}

function MessageBody({ message, mine, open, joinCall }: { message: DirectMessage; mine: boolean; open: (url: string) => void; joinCall: (url: string, mode: 'audio' | 'video') => void }) {
  const textStyle = mine ? styles.mineText : styles.theirText;
  if (message.message_type === 'image' && message.attachment_url) return <Pressable onPress={() => open(message.attachment_url!)}><Image source={{ uri: message.attachment_url }} contentFit="cover" style={styles.messageImage} /></Pressable>;
  if (message.message_type === 'audio') return <VoiceBubble message={message} mine={mine} />;
  if (message.message_type === 'video' && message.attachment_url) return <VideoBubble url={message.attachment_url} />;
  if (message.message_type === 'file') return <Pressable accessibilityRole="link" disabled={!message.attachment_url} onPress={() => message.attachment_url && open(message.attachment_url)}><Text style={textStyle}>📄 {message.attachment_name || message.body}</Text></Pressable>;
  if (message.message_type === 'call') {
    const callUrl = typeof message.metadata?.url === 'string' ? message.metadata.url : '';
    return <Pressable accessibilityRole="link" disabled={!callUrl} onPress={() => callUrl && joinCall(callUrl, message.metadata?.mode === 'video' ? 'video' : 'audio')}><Text style={textStyle}>{message.metadata?.mode === 'video' ? '📹 ' : '☎️ '}{message.body}{callUrl ? '  ›' : ''}</Text></Pressable>;
  }
  return <Text style={textStyle}>{message.body}</Text>;
}

export default function ChatScreen() {
  const { locale, t } = useI18n();
  const unread = useUnreadCounts();
  const insets = useSafeAreaInsets();
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [call, setCall] = useState<{ room: string; mode: 'audio' | 'video' } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<{ input: AttachmentInput; percent: number; phase: 'preparing' | 'uploading' | 'confirming' | 'failed'; error?: string } | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const uploadLock = useRef(false);
  const callLock = useRef(false);
  useEffect(() => () => { uploadController.current?.abort(); }, []);
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
  const sendAttachment = async (input: AttachmentInput) => {
    if (uploadLock.current) return;
    uploadLock.current = true;
    const controller = new AbortController(); uploadController.current = controller;
    setPending({ input, percent: 0, phase: 'preparing' });
    try {
      if (input.size && input.size > MAX_MESSAGE_FILE_BYTES) throw new Error(t('chat.attachmentTooLarge'));
      const convo = await conversationForUpload();
      const uploaded = await uploadMessageFile({ conversationId: convo.id, uri: input.uri, contentType: input.contentType, fileName: input.name, knownSize: input.size, signal: controller.signal,
        onProgress: percent => setPending({ input, percent, phase: percent === 100 ? 'confirming' : 'uploading' }) });
      try {
        const sent = await sendRichMessage(convo.id, { body: input.kind === 'image' ? '[图片]' : input.kind === 'video' ? '[视频]' : input.kind === 'audio' ? '[语音]' : `[文件] ${input.name || ''}`, messageType: input.kind, attachmentPath: uploaded.path, attachmentName: input.name || null, attachmentMime: input.contentType, attachmentSize: uploaded.size, attachmentDurationMs: input.durationMs || null });
        setMessages(rows => [...rows.filter(row => row.id !== sent.id), { ...sent, attachment_url: input.uri }]);
      } catch (error) { await removeMessageFile(convo.id, uploaded.path).catch(() => undefined); throw error; }
      setPending(null); await afterSend();
    } catch (error) { setPending({ input, percent: 0, phase: 'failed', error: error instanceof Error ? error.message : t('chat.tryAgain') }); }
    finally { uploadLock.current = false; uploadController.current = null; }
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
  const startCall = (mode: 'audio' | 'video') => Alert.alert(t('chat.callConfirmTitle'), t('chat.callConfirmBody'), [{ text: t('comments.cancel'), style: 'cancel' }, { text: t('chat.startCall'), onPress: () => void (async () => {
    if (callLock.current) return;
    callLock.current = true; setBusy(true);
    try {
      const convo = await conversationForUpload();
      const room = `TRRB-${randomUUID().replace(/-/g, '')}`;
      const url = `https://meet.jit.si/${room}${mode === 'audio' ? '#config.startWithVideoMuted=true' : ''}`;
      await sendRichMessage(convo.id, { body: mode === 'video' ? '[视频通话邀请]' : '[语音通话邀请]', messageType: 'call', metadata: { mode, url } });
      await afterSend(); joinCall(url, mode);
    } catch (error) { Alert.alert(t('chat.callUnavailable'), error instanceof Error ? error.message : t('chat.tryAgain')); }
    finally { callLock.current = false; setBusy(false); }
  })() }]);
  const joinCall = (url: string, mode: 'audio' | 'video') => {
    const room = callRoomFromUrl(url);
    if (!room) return Alert.alert(t('chat.callUnavailable'), t('chat.callRetryBody'));
    setCall({ room, mode });
  };
  const openUrl = (url: string) => { if (/^https:\/\//i.test(url)) void Linking.openURL(url).catch(() => Alert.alert(t('chat.actionFailed'), t('chat.tryAgain'))); };

  if (loading) return <View style={styles.statePage}><Stack.Screen options={{ headerShown: true, title: partner?.display_name || t('chat.screenTitle'), headerBackTitle: t('common.back') }} /><AsyncStatePanel testID="chat-loading" title={t('chat.loadingTitle')} message={t('chat.loadingBody')} busy /></View>;
  if (loadError && !partner) return <View style={styles.statePage}><Stack.Screen options={{ headerShown: true, title: t('chat.screenTitle'), headerBackTitle: t('common.back') }} /><AsyncStatePanel testID="chat-error" tone="error" title={t('chat.unavailable')} message={loadError} actionLabel={t('chat.reload')} onAction={() => { setLoading(true); void load(); }} /></View>;
  const incomingRequest = conversation?.status === 'pending' && conversation.recipient_user_id === me;
  const outgoingWaiting = conversation?.status === 'pending' && conversation.requester_user_id === me && messages.length > 0;
  const canCompose = !conversation || conversation.status === 'accepted' || (conversation.status === 'pending' && conversation.requester_user_id === me && messages.length === 0);
  const disabled = !canCompose || busy || attachmentBusy !== null || voiceBusy || Boolean(pending && pending.phase !== 'failed');

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <Stack.Screen options={{ headerShown: true, title: partner?.display_name || t('chat.screenTitle'), headerBackTitle: t('common.back') }} />
    <Pressable testID="chat-partner-profile" accessibilityRole="button" accessibilityLabel={t('chat.openProfileA11y', { name: partner?.display_name || t('userProfile.readerFallback') })} disabled={!partner?.id} style={styles.partner} onPress={() => partner?.id && router.push(`/user/${partner.id}`)}><TrRbAvatar avatarKey={partner?.avatar_key} avatarPath={partner?.avatar_path} size={40} /><View style={styles.partnerCopy}><Text style={styles.partnerName}>{partner?.display_name || t('userProfile.readerFallback')}</Text><Text style={styles.partnerState}>{t(conversation?.status === 'accepted' ? 'chat.confirmed' : 'chat.strangerProtection')}</Text></View><Text style={styles.partnerChevron}>›</Text></Pressable>
    <View style={styles.toolbar}><Pressable testID="chat-audio-call" disabled={disabled} style={styles.tool} onPress={() => startCall('audio')}><Text style={styles.toolText}>☎ {t('chat.audioCall')}</Text></Pressable><Pressable testID="chat-video-call" disabled={disabled} style={styles.tool} onPress={() => startCall('video')}><Text style={styles.toolText}>▣ {t('chat.videoCall')}</Text></Pressable><Pressable testID="chat-share-media" disabled={disabled} style={styles.tool} onPress={() => void pickMedia()}><Text style={styles.toolText}>▧ {attachmentBusy === 'media' ? t('chat.uploading') : t('chat.sharePhotoVideo')}</Text></Pressable><Pressable testID="chat-share-file" disabled={disabled} style={styles.tool} onPress={() => void pickFile()}><Text style={styles.toolText}>▤ {attachmentBusy === 'file' ? t('chat.uploading') : t('chat.shareFile')}</Text></Pressable></View>
    {loadError ? <View style={styles.inlineError}><AsyncStatePanel testID="chat-refresh-error" tone="error" title={t('chat.refreshFailed')} message={loadError} actionLabel={t('chat.resync')} onAction={() => void load()} /></View> : null}
    {incomingRequest ? <View style={styles.request}><Text style={styles.requestTitle}>{t('chat.incomingTitle')}</Text><Text style={styles.requestText}>{t('chat.incomingBody')}</Text><View style={styles.requestActions}><Pressable disabled={busy} style={styles.accept} onPress={() => void answer(true)}><Text style={styles.acceptText}>{t('chat.accept')}</Text></Pressable><Pressable disabled={busy} style={styles.decline} onPress={() => void answer(false)}><Text style={styles.declineText}>{t('chat.ignore')}</Text></Pressable></View></View> : null}
    <ScrollView ref={scroll} style={styles.messages} contentContainerStyle={styles.messagesContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
      {!messages.length ? <View style={styles.safety}><Text style={styles.safetyTitle}>{t('chat.safetyTitle')}</Text><Text style={styles.safetyText}>{t('chat.safetyBody')}</Text></View> : null}
      {messages.map((message, index) => { const mine = message.sender_user_id === me; return <View key={message.id} style={styles.messageRow}>{(!messages[index - 1] || chatDateLabel(messages[index - 1].created_at, localeDateTag(locale)) !== chatDateLabel(message.created_at, localeDateTag(locale))) ? <Text style={styles.dateDivider}>{chatDateLabel(message.created_at, localeDateTag(locale))}</Text> : null}<View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirWrap]}><View style={[styles.bubble, mine ? styles.mine : styles.their]}><MessageBody message={message} mine={mine} open={url => message.message_type === 'image' ? setImageUrl(url) : openUrl(url)} joinCall={joinCall} /></View><Text style={styles.time}>{new Date(message.created_at).toLocaleTimeString(localeDateTag(locale), { hour: '2-digit', minute: '2-digit' })}{mine && message.read_at ? ' · ✓✓' : ''}</Text></View></View>; })}
      {pending ? <View testID="chat-upload-progress" style={[styles.pendingBubble, styles.mineWrap]}><Text style={styles.pendingName}>{pending.input.name || t('chat.voice')}</Text><Text style={styles.pendingStatus}>{pending.phase === 'failed' ? pending.error || t('chat.uploadFailed') : t(pending.phase === 'preparing' ? 'chat.uploadPreparing' : pending.phase === 'confirming' ? 'chat.uploadConfirming' : 'chat.uploadProgress', { percent: pending.percent })}</Text>{pending.phase !== 'failed' ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pending.percent }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pending.percent}%` }]} /></View> : <View style={styles.requestActions}><Pressable onPress={() => void sendAttachment(pending.input)}><Text style={styles.retryText}>{t('chat.retryUpload')}</Text></Pressable><Pressable onPress={() => setPending(null)}><Text style={styles.retryText}>{t('chat.cancelUpload')}</Text></Pressable></View>}</View> : null}
    </ScrollView>
    {outgoingWaiting ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.waiting')}</Text></View> : null}
    {conversation?.status === 'declined' ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.declined')}</Text></View> : null}
    {conversation?.status === 'blocked' ? <View style={styles.waiting}><Text style={styles.waitingText}>{t('chat.blocked')}</Text></View> : null}
    {canCompose && showEmoji ? <View style={styles.emojiTray}>{EMOJI.map((item) => <Pressable key={item} style={styles.emojiButton} onPress={() => setText((value) => value + item)}><Text style={styles.emojiText}>{item}</Text></Pressable>)}</View> : null}
    {canCompose ? <View style={[styles.composer, { paddingBottom: Math.max(8, insets.bottom) }]}><Pressable accessibilityLabel={t(voiceMode ? 'chat.keyboard' : 'chat.voice')} disabled={busy || attachmentBusy !== null || voiceBusy} style={styles.roundButton} onPress={() => { setVoiceMode(value => !value); setShowEmoji(false); }}><Text>{voiceMode ? '⌨' : '🎙'}</Text></Pressable><Pressable accessibilityLabel={t('chat.emoji')} style={styles.roundButton} onPress={() => { setVoiceMode(false); setShowEmoji(value => !value); }} disabled={voiceBusy}><Text>☺</Text></Pressable>{voiceMode ? <HoldToTalk disabled={disabled} onBusy={setVoiceBusy} onSend={clip => sendAttachment({ uri: clip.uri, contentType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', name: Platform.OS === 'web' ? 'voice-message.webm' : 'voice-message.m4a', durationMs: clip.durationMs, kind: 'audio' })} /> : <><TextInput accessibilityLabel={t('chat.messageA11y')} value={text} onChangeText={setText} maxLength={2000} multiline placeholder={t(conversation ? 'chat.inputPlaceholder' : 'chat.requestPlaceholder')} style={styles.input} /><Pressable accessibilityLabel={t('chat.sendA11y')} disabled={disabled || !text.trim()} style={[styles.send, (disabled || !text.trim()) && styles.disabled]} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>{t('chat.send')}</Text>}</Pressable></>}</View> : null}
    {call ? <ChatCallView room={call.room} mode={call.mode} name="" onClose={() => setCall(null)} /> : null}
    <Modal visible={Boolean(imageUrl)} transparent animationType="fade" onRequestClose={() => setImageUrl(null)}><Pressable style={styles.imageViewer} accessibilityLabel={t('common.back')} onPress={() => setImageUrl(null)}><Image source={{ uri: imageUrl || '' }} contentFit="contain" style={styles.fullImage} /><Text style={styles.closeImage}>{t('common.back')}</Text></Pressable></Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({messageRow:{width:'100%'},dateDivider:{alignSelf:'center',color:'#98a2b3',fontSize:12,marginVertical:14},pendingBubble:{backgroundColor:'#fff',padding:14,borderRadius:14,marginBottom:12,minWidth:200,maxWidth:'82%'},pendingName:{fontWeight:'800',color:'#344054'},pendingStatus:{marginTop:6,fontSize:12,color:'#667085'},progressTrack:{height:4,backgroundColor:'#eaecf0',marginTop:10,borderRadius:2},progressFill:{height:4,backgroundColor:'#c8211e',borderRadius:2},retryText:{color:'#b42318',fontWeight:'800'},imageViewer:{flex:1,backgroundColor:'rgba(0,0,0,.95)',justifyContent:'center'},fullImage:{width:'100%',height:'85%'},closeImage:{color:'#fff',alignSelf:'center',padding:16},page:{flex:1,backgroundColor:'#f5f6f8'},statePage:{flex:1,justifyContent:'center',backgroundColor:'#f5f6f8',padding:14},inlineError:{padding:10},partner:{backgroundColor:'#fff',paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:'#eaecf0'},partnerCopy:{flex:1},partnerName:{fontWeight:'900',color:'#101828'},partnerState:{fontSize:11,color:'#98a2b3',marginTop:2},partnerChevron:{fontSize:26,color:'#98a2b3'},toolbar:{backgroundColor:'#fff',padding:8,flexDirection:'row',flexWrap:'wrap',gap:6,borderBottomWidth:1,borderBottomColor:'#eaecf0'},tool:{minHeight:38,borderRadius:10,backgroundColor:'#f2f4f7',paddingHorizontal:10,alignItems:'center',justifyContent:'center'},toolText:{color:'#344054',fontWeight:'800',fontSize:12},request:{backgroundColor:'#fffaeb',padding:14,borderBottomWidth:1,borderBottomColor:'#fedf89'},requestTitle:{fontWeight:'900',color:'#7a2e0e'},requestText:{color:'#93370d',fontSize:13,lineHeight:19,marginTop:4},requestActions:{flexDirection:'row',gap:9,marginTop:11},accept:{backgroundColor:'#c8211e',paddingHorizontal:16,paddingVertical:10,borderRadius:9},acceptText:{color:'#fff',fontWeight:'900'},decline:{borderWidth:1,borderColor:'#d0d5dd',paddingHorizontal:16,paddingVertical:10,borderRadius:9,backgroundColor:'#fff'},declineText:{color:'#475467',fontWeight:'900'},messages:{flex:1},messagesContent:{padding:14,paddingBottom:24},safety:{backgroundColor:'#fff',borderRadius:14,padding:18,alignItems:'center',marginVertical:16},safetyTitle:{fontWeight:'900',color:'#344054'},safetyText:{color:'#98a2b3',fontSize:13,lineHeight:19,textAlign:'center',marginTop:5},bubbleWrap:{marginBottom:12,maxWidth:'82%'},mineWrap:{alignSelf:'flex-end',alignItems:'flex-end'},theirWrap:{alignSelf:'flex-start',alignItems:'flex-start'},bubble:{borderRadius:16,paddingHorizontal:14,paddingVertical:10,overflow:'hidden'},mine:{backgroundColor:'#c8211e',borderBottomRightRadius:4},their:{backgroundColor:'#fff',borderBottomLeftRadius:4,borderWidth:1,borderColor:'#eaecf0'},mineText:{color:'#fff',fontSize:16,lineHeight:22},theirText:{color:'#101828',fontSize:16,lineHeight:22},messageImage:{width:220,height:180,borderRadius:10},voiceBubble:{minWidth:120,minHeight:34,justifyContent:'center'},time:{fontSize:10,color:'#98a2b3',marginTop:3},waiting:{backgroundColor:'#f2f4f7',padding:11},waitingText:{color:'#667085',fontSize:12,textAlign:'center'},emojiTray:{backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#eaecf0',padding:8,flexDirection:'row',flexWrap:'wrap'},emojiButton:{width:'16.66%',minHeight:42,alignItems:'center',justifyContent:'center'},emojiText:{fontSize:24},composer:{backgroundColor:'#fff',padding:8,flexDirection:'row',alignItems:'flex-end',gap:6,borderTopWidth:1,borderTopColor:'#eaecf0'},roundButton:{minWidth:38,height:42,borderRadius:12,backgroundColor:'#f2f4f7',alignItems:'center',justifyContent:'center'},recording:{backgroundColor:'#fee4e2'},input:{flex:1,maxHeight:110,minHeight:42,borderWidth:1,borderColor:'#d0d5dd',borderRadius:14,paddingHorizontal:11,paddingVertical:9,fontSize:16},send:{height:42,minWidth:60,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:12},disabled:{opacity:.45},sendText:{color:'#fff',fontWeight:'900'}});
