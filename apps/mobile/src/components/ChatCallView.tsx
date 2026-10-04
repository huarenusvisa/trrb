import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useI18n } from '../i18n/I18nProvider';
import { AsyncStatePanel } from './AsyncStatePanel';

export function ChatCallView({ room, mode, name, onClose }: { room: string; mode: 'audio' | 'video'; name: string; onClose: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#call{height:100%;margin:0;background:#101828}</style></head><body><div id="call"></div><script src="https://meet.jit.si/external_api.js"></script><script>
    const report = value => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(value);
    try {
      const api = new JitsiMeetExternalAPI('meet.jit.si', {
        roomName: ${JSON.stringify(room)}, parentNode: document.getElementById('call'), width: '100%', height: '100%',
        userInfo: { displayName: ${JSON.stringify(name).replace(/</g, '\\u003c')} },
        configOverwrite: { startWithVideoMuted: ${mode === 'audio'}, startAudioOnly: ${mode === 'audio'}, prejoinConfig: { enabled: true }, deeplinking: { disabled: true }, disableDeepLinking: true },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false }
      });
      api.addListener('readyToClose', () => report('closed'));
      api.addListener('errorOccurred', () => report('error'));
      window.addEventListener('pagehide', () => api.dispose());
    } catch (error) { report('error'); }
  </script></body></html>`, [room, mode, name]);
  return <Modal animationType="slide" visible onRequestClose={onClose}><SafeAreaView style={styles.page}>
    <View style={styles.header}><Text style={styles.title}>{t(mode === 'audio' ? 'chat.audioCall' : 'chat.videoCall')}</Text><Pressable accessibilityRole="button" onPress={onClose} style={styles.end}><Text style={styles.endText}>{t('chat.endCall')}</Text></Pressable></View>
    {error ? <AsyncStatePanel tone="error" title={t('chat.callUnavailable')} message={t('chat.callRetryBody')} actionLabel={t('chat.reload')} onAction={() => { setError(false); setAttempt(value => value + 1); }} /> : Platform.OS === 'web'
      ? <iframe title={t('chat.joinCall')} src={`https://meet.jit.si/${room}#config.deeplinking.disabled=true&config.startWithVideoMuted=${mode === 'audio'}`} allow="camera; microphone; fullscreen; autoplay" style={{ flex: 1, width: '100%', border: 0 }} />
      : <WebView key={attempt} testID="chat-in-app-call" source={{ html, baseUrl: 'https://meet.jit.si' }} style={styles.web}
          originWhitelist={['*']} onShouldStartLoadWithRequest={request => request.url === 'about:blank' || /^https:\/\//i.test(request.url)}
          allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} mediaCapturePermissionGrantType="prompt"
          javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
          onOpenWindow={() => undefined} onError={() => setError(true)} onHttpError={() => setError(true)}
          onMessage={event => { if (event.nativeEvent.data === 'closed') onClose(); if (event.nativeEvent.data === 'error') setError(true); }} />}
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#101828' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }, title: { color: '#fff', fontWeight: '800', fontSize: 18 }, end: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#c8211e', borderRadius: 20 }, endText: { color: '#fff', fontWeight: '800' }, web: { flex: 1 } });
