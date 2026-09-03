import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { isAuthConfigured, supabase } from '../src/auth/supabase';
import { loginOrRegister, validateCredentialCode } from '../src/auth/unified-account';
import { useI18n } from '../src/i18n/I18nProvider';
import { authClientErrorMessage, authValidationMessage } from '../src/i18n/i18n-core';

export default function AuthScreen() {
  const { locale, t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const validate = () => {
    const validationCode = validateCredentialCode(identifier, password);
    if (validationCode) {
      setMessage(authValidationMessage(locale, validationCode));
      return false;
    }
    if (!isAuthConfigured) {
      Alert.alert(t('auth.notConfiguredTitle'), t('auth.notConfiguredBody'));
      return false;
    }
    return true;
  };

  const signIn = async () => {
    if (!validate()) return;
    setMessage('');
    setBusy(true);
    try {
      const result = await loginOrRegister(identifier, password);
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      Alert.alert(result.created ? t('auth.registerSuccess') : t('auth.signInSuccess'), result.created ? t('auth.registerSuccessBody') : t('auth.welcomeBack'), [
        { text: t('auth.continue'), onPress: () => router.back() },
      ]);
    } catch (error) {
      setMessage(authClientErrorMessage(locale, error));
    } finally { setBusy(false); }
  };

  return <View style={styles.page}>
    <Stack.Screen options={{ title: t('auth.screenTitle'), headerBackTitle: t('common.back') }} />
    <Text style={styles.h1}>{t('auth.heading')}</Text>
    <Text style={styles.sub}>{t('auth.description')}</Text>
    <TextInput testID="auth-identifier" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder={t('auth.identifierPlaceholder')} style={styles.input} editable={!busy} />
    <TextInput testID="auth-password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder={t('auth.passwordPlaceholder')} style={styles.input} editable={!busy} onSubmitEditing={() => void signIn()} />
    {message ? <Text testID="auth-message" accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
    {busy ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
    <Pressable testID="auth-submit" accessibilityRole="button" style={[styles.primary, busy && styles.disabled]} onPress={signIn} disabled={busy}><Text style={styles.primaryText}>{busy ? t('auth.busy') : t('auth.submit')}</Text></Pressable>
    <Pressable testID="auth-guest" style={styles.guest} onPress={() => router.back()} disabled={busy}><Text style={styles.guestText}>{t('auth.guest')}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff',padding:22,paddingTop:60},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{fontSize:15,lineHeight:23,color:'#667085',marginTop:8,marginBottom:28},input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:14,fontSize:16,marginBottom:12},error:{color:'#b42318',backgroundColor:'#fff1f0',padding:12,borderRadius:10,marginBottom:12,lineHeight:20},primary:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:15,alignItems:'center',marginTop:4},disabled:{opacity:0.65},primaryText:{color:'#fff',fontWeight:'800',fontSize:16},guest:{paddingVertical:18,alignItems:'center'},guestText:{color:'#667085',fontWeight:'700'}});
