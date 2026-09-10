import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { AccountSecurityStatus, bindRecoveryEmail, getAccountSecurityStatus } from '../src/auth/account-security';
import { supabase } from '../src/auth/supabase';
import { useI18n } from '../src/i18n/I18nProvider';

export default function AccountSecurityScreen() {
  const { t } = useI18n();
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token || '';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setStatus(await getAccountSecurityStatus({ accessToken: await accessToken() })); }
    catch { setError(t('accountSecurity.loadFailed')); }
    finally { setLoading(false); }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const bindEmail = async () => {
    if (!email.trim() || !password) { setError(t('accountSecurity.bindFailed')); return; }
    setBusy(true); setError('');
    try {
      const next = await bindRecoveryEmail(email, password, { accessToken: await accessToken() });
      setStatus(next); setPassword('');
      Alert.alert(t('accountSecurity.bindSuccess'), t('accountSecurity.bindSuccessBody'));
    } catch (cause) {
      setError(cause instanceof Error && !['network', 'timeout', 'request_failed'].includes(cause.message) ? cause.message : t('accountSecurity.bindFailed'));
    } finally { setBusy(false); }
  };

  const emailStatusText = status?.emailStatus === 'verified' ? t('accountSecurity.emailVerified') : status?.emailStatus === 'pending' ? t('accountSecurity.emailPending') : t('accountSecurity.emailMissing');

  return <ScrollView testID="screen-account-security" style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ title: t('accountSecurity.title'), headerBackTitle: t('common.back') }} />
    <Text style={styles.h1}>{t('accountSecurity.heading')}</Text>
    <Text style={styles.sub}>{t('accountSecurity.description')}</Text>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#c8211e" /><Text style={styles.muted}>{t('accountSecurity.loading')}</Text></View> : null}
    {error ? <Text testID="account-security-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {status ? <>
      <View style={styles.card}>
        <Text style={styles.label}>{t('accountSecurity.account')}</Text><Text style={styles.value}>{status.loginLabel}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('accountSecurity.emailRecovery')}</Text>
        {status.recoveryEmailMasked ? <Text style={styles.value}>{status.recoveryEmailMasked}</Text> : null}
        <Text style={[styles.muted, status.emailStatus === 'verified' && styles.success]}>{status.loginType === 'email' ? t('accountSecurity.emailAccount') : emailStatusText}</Text>
        {status.canBindEmail ? <View style={styles.form}>
          <TextInput testID="recovery-email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder={t('accountSecurity.emailPlaceholder')} style={styles.input} editable={!busy} />
          <View style={styles.passwordRow}><TextInput testID="recovery-current-password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete="password" placeholder={t('accountSecurity.currentPassword')} style={styles.passwordInput} editable={!busy} /><Pressable testID="recovery-password-toggle" accessibilityRole="button" style={styles.toggle} onPress={() => setShowPassword((value) => !value)}><Text style={styles.toggleText}>{t(showPassword ? 'password.hide' : 'password.show')}</Text></Pressable></View>
          <Pressable testID="bind-recovery-email" accessibilityRole="button" style={[styles.primary, busy && styles.disabled]} onPress={() => void bindEmail()} disabled={busy}><Text style={styles.primaryText}>{busy ? t('accountSecurity.binding') : t('accountSecurity.bindEmail')}</Text></Pressable>
        </View> : null}
      </View>
      <View style={styles.card}><Text style={styles.cardTitle}>{t('accountSecurity.smsRecovery')}</Text><Text style={styles.muted}>{t('accountSecurity.smsDisabled')}</Text></View>
      {status.loginType === 'phone' ? <Text style={styles.note}>{t('accountSecurity.legacy')}</Text> : null}
      <Pressable testID="account-security-change-password" accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/change-password')}><View><Text style={styles.secondaryTitle}>{t('accountSecurity.changePassword')}</Text><Text style={styles.muted}>{t('accountSecurity.changePasswordMeta')}</Text></View><Text style={styles.chevron}>›</Text></Pressable>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:20,paddingTop:28,paddingBottom:48},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{fontSize:15,lineHeight:23,color:'#667085',marginTop:8,marginBottom:20},loading:{backgroundColor:'#fff',borderRadius:14,padding:18,flexDirection:'row',alignItems:'center',gap:10},error:{color:'#b42318',backgroundColor:'#fff1f0',padding:14,borderRadius:12,marginBottom:12,lineHeight:21},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#eaecf0',borderRadius:16,padding:17,marginBottom:12},label:{fontSize:13,color:'#667085',fontWeight:'700'},value:{fontSize:18,color:'#101828',fontWeight:'900',marginTop:6},cardTitle:{fontSize:18,color:'#101828',fontWeight:'900',marginBottom:7},muted:{fontSize:14,color:'#667085',lineHeight:21},success:{color:'#067647',fontWeight:'700'},form:{marginTop:16,gap:10},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:14,fontSize:16},passwordRow:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#d0d5dd',borderRadius:12},passwordInput:{flex:1,paddingHorizontal:14,paddingVertical:14,fontSize:16},toggle:{minWidth:64,minHeight:48,alignItems:'center',justifyContent:'center'},toggleText:{color:'#c8211e',fontWeight:'800'},primary:{minHeight:52,backgroundColor:'#c8211e',borderRadius:12,alignItems:'center',justifyContent:'center'},disabled:{opacity:.6},primaryText:{color:'#fff',fontWeight:'900',fontSize:16},note:{fontSize:13,lineHeight:20,color:'#667085',paddingHorizontal:4,marginBottom:14},secondary:{minHeight:68,backgroundColor:'#fff',borderWidth:1,borderColor:'#eaecf0',borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},secondaryTitle:{fontSize:17,fontWeight:'900',color:'#101828',marginBottom:3},chevron:{fontSize:30,color:'#98a2b3'},
});
