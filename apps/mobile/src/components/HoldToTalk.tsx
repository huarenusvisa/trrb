import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useI18n } from '../i18n/I18nProvider';
import { createHoldRecorder, type VoiceClip } from '../social/chat-interaction-core';

export function HoldToTalk({ disabled, onSend, onBusy }: { disabled: boolean; onSend: (clip: VoiceClip) => Promise<void>; onBusy: (busy: boolean) => void }) {
  const { t } = useI18n();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState('idle');
  const [cancel, setCancel] = useState(false);
  const startY = useRef(0), cancelling = useRef(false), started = useRef(false), prepared = useRef(false);
  const callbacks = useRef({ onSend, onBusy, t }); callbacks.current = { onSend, onBusy, t };
  const controller = useMemo(() => createHoldRecorder({
    prepare: async () => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error(callbacks.current.t('chat.recordPermissionBody'));
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(); prepared.current = true;
    },
    start: () => { recorder.record(); started.current = true; },
    stop: async () => {
      if (!prepared.current) return null;
      const didStart = started.current;
      const durationMs = recorder.getStatus().durationMillis;
      await recorder.stop(); started.current = prepared.current = false;
      if (didStart && !recorder.uri) throw new Error(callbacks.current.t('chat.sendFailed'));
      return didStart && recorder.uri ? { uri: recorder.uri, durationMs } : null;
    },
    reset: () => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }),
    send: (clip) => callbacks.current.onSend(clip),
    onState: (state) => { setPhase(state); callbacks.current.onBusy(state !== 'idle'); },
    onError: (error) => Alert.alert(callbacks.current.t('chat.actionFailed'), error instanceof Error ? error.message : callbacks.current.t('chat.tryAgain')),
    onTooShort: () => Alert.alert(callbacks.current.t('chat.voiceTooShort')),
  }), [recorder]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') void controller.finish(true); });
    return () => { listener.remove(); controller.dispose(); void controller.finish(true); };
  }, [controller]);
  useEffect(() => { if (status.isRecording && status.durationMillis >= 60_000) void controller.finish(); }, [status.durationMillis, status.isRecording, controller]);
  return <View style={styles.wrap}>
    {phase !== 'idle' && phase !== 'sending' ? <View pointerEvents="none" style={[styles.overlay, cancel && styles.cancel]}><Text style={styles.wave}>▂ ▅ ▃ ▇ ▆ ▂ ▅</Text><Text style={styles.overlayText}>{cancel ? t('chat.releaseCancel') : phase === 'preparing' ? t('chat.preparingVoice') : t('chat.releaseSend')}</Text><Text style={styles.overlayText}>{Math.ceil(status.durationMillis / 1000)}s</Text></View> : null}
    <View testID="chat-hold-to-talk" accessible accessibilityRole="button" accessibilityLabel={t('chat.holdToTalk')} accessibilityHint={t('chat.slideCancel')} style={[styles.hold, phase === 'recording' && styles.pressed]}
      onStartShouldSetResponder={() => !disabled && phase === 'idle'}
      onResponderGrant={event => { startY.current = event.nativeEvent.pageY; cancelling.current = false; setCancel(false); controller.begin(); }}
      onResponderMove={event => { cancelling.current = startY.current - event.nativeEvent.pageY > 60; setCancel(cancelling.current); }}
      onResponderRelease={() => void controller.finish(cancelling.current)}
      onResponderTerminationRequest={() => false}
      onResponderTerminate={() => void controller.finish(true)}>
      <Text style={styles.holdText}>{phase === 'sending' ? t('chat.uploading') : phase === 'recording' ? t('chat.releaseSend') : t('chat.holdToTalk')}</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({ wrap: { flex: 1 }, hold: { minHeight: 44, borderRadius: 14, backgroundColor: '#f2f4f7', justifyContent: 'center', alignItems: 'center' }, holdText: { fontWeight: '800', color: '#344054' }, pressed: { backgroundColor: '#d1fadf' }, overlay: { position: 'absolute', bottom: 80, alignSelf: 'center', minWidth: 190, backgroundColor: '#16803c', borderRadius: 18, padding: 20, alignItems: 'center' }, cancel: { backgroundColor: '#b42318' }, wave: { color: '#fff', fontSize: 28 }, overlayText: { color: '#fff', marginTop: 8, fontWeight: '700' } });
