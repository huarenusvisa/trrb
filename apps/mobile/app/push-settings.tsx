import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '../src/i18n/I18nProvider';
import type { MessageKey } from '../src/i18n/i18n-core';
import { getPushPreferences, PushPreferences, updatePushPreferences } from '../src/push/preferences';
import { disableCurrentDevicePushToken, getPendingPushRegistrationStatus, getPushPermissionStatus, hasCurrentDevicePushToken, registerPushToken, retryPendingPushRegistration } from '../src/push/registration';

const OPTIONS: { key: keyof PushPreferences; title: MessageKey; description: MessageKey }[] = [
  { key: 'breaking_news', title: 'push.breakingNews', description: 'push.breakingNewsMeta' },
  { key: 'ice', title: 'push.ice', description: 'push.iceMeta' },
  { key: 'immigration', title: 'push.immigration', description: 'push.immigrationMeta' },
  { key: 'legal', title: 'push.legal', description: 'push.legalMeta' },
  { key: 'comments', title: 'push.comments', description: 'push.commentsMeta' },
  { key: 'likes', title: 'push.likes', description: 'push.likesMeta' },
  { key: 'follows', title: 'push.follows', description: 'push.followsMeta' },
  { key: 'messages', title: 'push.messages', description: 'push.messagesMeta' },
  { key: 'moderation', title: 'push.moderation', description: 'push.moderationMeta' }
];

export default function PushSettingsScreen() {
  const { t } = useI18n();
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [pendingSync, setPendingSync] = useState<{ attempts: number; retryAt: number } | null>(null);
  const [savingKey, setSavingKey] = useState<keyof PushPreferences | null>(null);

  useEffect(() => {
    Promise.all([getPushPreferences(), getPushPermissionStatus(), hasCurrentDevicePushToken(), getPendingPushRegistrationStatus()]).then(([nextPreferences, nextPermission, hasToken, nextPendingSync]) => {
      setPreferences(nextPreferences);
      setPermission(nextPermission.status);
      setCanAskAgain(nextPermission.canAskAgain);
      setEnabled(nextPermission.status === 'granted' && hasToken);
      setPendingSync(nextPendingSync);
    }).catch((error) => Alert.alert(t('push.loadFailed'), error instanceof Error ? error.message : t('push.retryLater'))).finally(() => setBusy(false));
  }, [t]);

  const enablePush = async () => {
    setBusy(true);
    try {
      const token = await registerPushToken({ requestPermission: true });
      const nextPermission = await getPushPermissionStatus();
      setPermission(nextPermission.status);
      setCanAskAgain(nextPermission.canAskAgain);
      setEnabled(Boolean(token));
      setPendingSync(await getPendingPushRegistrationStatus());
      if (!token) {
        Alert.alert(t('push.pendingTitle'), nextPermission.canAskAgain ? t('push.allowPrompt') : t('push.systemPrompt'));
      }
    } catch (error) {
      setPendingSync(await getPendingPushRegistrationStatus().catch(() => null));
      Alert.alert(t('push.enableFailed'), error instanceof Error ? error.message : t('push.networkRetry'));
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      await disableCurrentDevicePushToken({ rememberDeviceChoice: true });
      setEnabled(false);
      setPendingSync(null);
    } catch (error) {
      Alert.alert(t('push.disableFailed'), error instanceof Error ? error.message : t('push.networkRetry'));
    } finally {
      setBusy(false);
    }
  };

  const retryPendingSync = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const token = await retryPendingPushRegistration();
      const nextPendingSync = await getPendingPushRegistrationStatus();
      setPendingSync(nextPendingSync);
      if (!token) {
        const nextPermission = await getPushPermissionStatus();
        setPermission(nextPermission.status);
        setCanAskAgain(nextPermission.canAskAgain);
        throw new Error(nextPermission.canAskAgain ? t('push.allowPrompt') : t('push.systemPrompt'));
      }
      setEnabled(true);
      AccessibilityInfo.announceForAccessibility(t('push.retrySucceeded'));
    } catch (error) {
      setPendingSync(await getPendingPushRegistrationStatus().catch(() => null));
      Alert.alert(t('push.retryFailed'), error instanceof Error ? error.message : t('push.networkRetry'));
    } finally {
      setRetrying(false);
    }
  };

  const togglePreference = async (key: keyof PushPreferences, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    setSavingKey(key);
    try {
      await updatePushPreferences({ [key]: value });
    } catch (error) {
      setPreferences(previous);
      Alert.alert(t('push.saveFailed'), error instanceof Error ? error.message : t('push.retryLater'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <ScrollView testID="screen-push-settings" style={styles.page} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()}><Text style={styles.back}>{t('push.back')}</Text></Pressable>
      <Text style={styles.h1}>{t('push.heading')}</Text>
      <Text style={styles.sub}>{t('push.description')}</Text>
      <View style={styles.card}>
        <View style={styles.rowText}>
          <Text style={styles.title}>{t('push.deviceTitle')}</Text>
          <Text testID="push-device-status" style={styles.meta}>{enabled ? t('push.enabled') : permission === 'denied' ? t('push.permissionDenied') : t('push.disabled')}</Text>
        </View>
        {busy ? <ActivityIndicator /> : <Switch testID="push-device-toggle" accessibilityLabel={t('push.deviceTitle')} value={enabled} onValueChange={(value) => void (value ? enablePush() : disablePush())} trackColor={{ true: '#c8211e' }} />}
      </View>
      {pendingSync ? (
        <View testID="push-registration-pending" accessibilityLiveRegion="polite" style={styles.pendingCard}>
          <Text style={styles.pendingText}>{t('push.pendingSync', { count: pendingSync.attempts })}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('push.retryPendingA11y')}
            disabled={retrying || busy}
            testID="push-registration-retry"
            style={({ pressed }) => [styles.retryButton, (pressed || retrying || busy) && styles.retryButtonPressed]}
            onPress={() => void retryPendingSync()}
          >
            <Text style={styles.retryButtonText}>{retrying ? t('push.retrying') : t('push.retryNow')}</Text>
          </Pressable>
        </View>
      ) : null}
      {!enabled && permission === 'denied' && !canAskAgain ? <Pressable accessibilityRole="button" accessibilityLabel={t('push.openSystemSettings')} testID="open-system-settings" style={styles.settingsButton} onPress={() => void Linking.openSettings()}><Text style={styles.settingsButtonText}>{t('push.openSystemSettings')}</Text></Pressable> : null}
      <Text style={styles.section}>{t('push.types')}</Text>
      {preferences ? OPTIONS.map((option) => (
        <View key={option.key} style={styles.card}>
          <View style={styles.rowText}><Text style={styles.title}>{t(option.title)}</Text><Text style={styles.meta}>{t(option.description)}</Text></View>
          <Switch testID={`push-preference-${option.key}`} accessibilityLabel={t(option.title)} disabled={savingKey !== null} value={preferences[option.key]} onValueChange={(value) => void togglePreference(option.key, value)} trackColor={{ true: '#c8211e' }} />
        </View>
      )) : null}
      <Text style={styles.footnote}>{t('push.footnote')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:18,paddingTop:58,paddingBottom:40},back:{color:'#c8211e',fontSize:17,fontWeight:'700',marginBottom:18},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:8,marginBottom:22,lineHeight:21},section:{fontWeight:'800',color:'#475467',marginTop:18,marginBottom:10},card:{backgroundColor:'#fff',borderRadius:14,padding:17,marginBottom:12,flexDirection:'row',alignItems:'center',gap:14},rowText:{flex:1},title:{fontSize:17,fontWeight:'800',color:'#101828'},meta:{color:'#667085',marginTop:5,lineHeight:19},pendingCard:{backgroundColor:'#fff7ed',borderWidth:1,borderColor:'#fed7aa',borderRadius:14,padding:15,marginBottom:12},pendingText:{color:'#9a3412',lineHeight:21},retryButton:{alignSelf:'flex-start',minHeight:44,justifyContent:'center',borderRadius:10,backgroundColor:'#c8211e',paddingHorizontal:16,marginTop:12},retryButtonPressed:{opacity:0.55},retryButtonText:{color:'#fff',fontWeight:'800'},settingsButton:{borderWidth:1,borderColor:'#c8211e',borderRadius:12,padding:13,alignItems:'center',marginBottom:8},settingsButtonText:{color:'#c8211e',fontWeight:'800'},footnote:{color:'#98a2b3',lineHeight:20,marginTop:10}
});
