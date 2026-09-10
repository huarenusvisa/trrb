import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { requestPasswordRecovery } from '../src/auth/password-recovery';
import { useI18n } from '../src/i18n/I18nProvider';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ identifier?: string }>();
  const [identifier, setIdentifier] = useState(typeof params.identifier === 'string' ? params.identifier : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  const submit = async () => {
    setMessage(''); setSupportEmail(''); setBusy(true);
    try {
      const result = await requestPasswordRecovery(identifier);
      if (result.method === 'email') setMessage(t('recovery.emailSentBody'));
      else { setMessage(t('recovery.phoneBody')); setSupportEmail(result.supportEmail || 'tangrenribao@gmail.com'); }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setMessage(code === 'invalid_identifier' ? t('recovery.invalid') : code === 'timeout' || code === 'network' ? t('recovery.timeout') : code || t('recovery.failed'));
    } finally { setBusy(false); }
  };

  const contactSupport = async () => {
    const url = `mailto:${supportEmail}?subject=${encodeURIComponent(t('recovery.supportSubject'))}&body=${encodeURIComponent(t('recovery.supportBody', { identifier }))}`;
    try { await Linking.openURL(url); } catch { Alert.alert(t('recovery.supportFailed'), supportEmail); }
  };

  return <View style={styles.page}>
    <Stack.Screen options={{ title: t('recovery.title'), headerShown: true, headerBackTitle: t('common.back') }} />
    <Text style={styles.h1}>{t('recovery.heading')}</Text>
    <Text style={styles.sub}>{t('recovery.description')}</Text>
    <TextInput testID="recovery-identifier" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder={t('auth.identifierPlaceholder')} style={styles.input} editable={!busy} onSubmitEditing={() => void submit()} />
    {message ? <Text testID="recovery-message" accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    {busy ? <ActivityIndicator style={styles.busy} /> : null}
    <Pressable testID="recovery-submit" accessibilityRole="button" style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}><Text style={styles.primaryText}>{busy ? t('recovery.sending') : t('recovery.send')}</Text></Pressable>
    {supportEmail ? <Pressable testID="recovery-support" accessibilityRole="button" style={styles.secondary} onPress={contactSupport}><Text style={styles.secondaryText}>{t('recovery.contactSupport')}</Text><Text style={styles.supportEmail}>{supportEmail}</Text></Pressable> : null}
    <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>{t('recovery.backToSignIn')}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({ page:{flex:1,backgroundColor:'#fff',padding:22,paddingTop:34}, h1:{fontSize:30,fontWeight:'900',color:'#101828'}, sub:{fontSize:15,lineHeight:23,color:'#667085',marginTop:8,marginBottom:28}, input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:15,fontSize:16}, message:{color:'#344054',backgroundColor:'#f2f4f7',padding:14,borderRadius:10,marginTop:14,lineHeight:22}, busy:{marginTop:14}, primary:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:16,alignItems:'center',marginTop:16,minHeight:54}, disabled:{opacity:.65}, primaryText:{color:'#fff',fontWeight:'800',fontSize:16}, secondary:{borderWidth:1,borderColor:'#c8211e',borderRadius:12,padding:14,alignItems:'center',marginTop:12}, secondaryText:{color:'#c8211e',fontWeight:'800',fontSize:16}, supportEmail:{color:'#667085',marginTop:4}, back:{paddingVertical:18,alignItems:'center'}, backText:{color:'#667085',fontWeight:'700'} });
