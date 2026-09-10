import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { changeAccountPassword } from '../src/auth/change-password';
import { accountLabel } from '../src/auth/unified-account';
import { supabase } from '../src/auth/supabase';
import { useI18n } from '../src/i18n/I18nProvider';

function PasswordField({ label, value, onChangeText, visible, onToggle, testID }: { label: string; value: string; onChangeText: (v: string) => void; visible: boolean; onToggle: () => void; testID: string }) {
  const { t } = useI18n();
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.inputRow}><TextInput testID={testID} value={value} onChangeText={onChangeText} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel={t(visible ? 'password.hide' : 'password.show')} onPress={onToggle} style={styles.toggle}><Text style={styles.toggleText}>{t(visible ? 'password.hide' : 'password.show')}</Text></Pressable></View></View>;
}

export default function ChangePasswordScreen() {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setLabel(accountLabel(data.user))); }, []);
  const submit = async () => {
    if (next.length < 8 || next.length > 128) return setError(t('changePassword.length'));
    if (next !== confirm) return setError(t('changePassword.mismatch'));
    setBusy(true); setError('');
    try {
      await changeAccountPassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      Alert.alert(t('changePassword.success'), t('changePassword.successBody'), [{ text: t('common.done'), onPress: () => router.back() }]);
    } catch (e) { setError(e instanceof Error ? e.message : t('changePassword.failed')); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ title: t('changePassword.title'), headerBackTitle: t('common.back') }} />
    <Text style={styles.h1}>{t('changePassword.heading')}</Text>
    <Text style={styles.description}>{t('changePassword.description')}</Text>
    {label ? <Text style={styles.account}>{t('changePassword.account', { account: label })}</Text> : null}
    <PasswordField label={t('changePassword.current')} value={current} onChangeText={setCurrent} visible={Boolean(shown.current)} onToggle={() => setShown((old) => ({ ...old, current: !old.current }))} testID="current-password" />
    <PasswordField label={t('changePassword.new')} value={next} onChangeText={setNext} visible={Boolean(shown.next)} onToggle={() => setShown((old) => ({ ...old, next: !old.next }))} testID="new-password" />
    <PasswordField label={t('changePassword.confirm')} value={confirm} onChangeText={setConfirm} visible={Boolean(shown.confirm)} onToggle={() => setShown((old) => ({ ...old, confirm: !old.confirm }))} testID="confirm-password" />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy || !current || !next || !confirm} style={[styles.submit, (busy || !current || !next || !confirm) && styles.disabled]} onPress={() => void submit()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('changePassword.submit')}</Text>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({page:{flexGrow:1,backgroundColor:'#f5f6f8',padding:20,paddingTop:50},h1:{fontSize:30,fontWeight:'900',color:'#101828'},description:{color:'#667085',lineHeight:22,marginTop:8,marginBottom:12},account:{color:'#344054',fontWeight:'700',marginBottom:20},field:{marginBottom:16},label:{fontWeight:'800',color:'#344054',marginBottom:7},inputRow:{flexDirection:'row',backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,alignItems:'center'},input:{flex:1,paddingHorizontal:14,paddingVertical:14,fontSize:16,color:'#101828'},toggle:{minWidth:64,minHeight:48,alignItems:'center',justifyContent:'center',paddingHorizontal:10},toggleText:{color:'#c8211e',fontWeight:'800'},error:{color:'#b42318',backgroundColor:'#fff1f0',padding:12,borderRadius:10,marginBottom:14},submit:{backgroundColor:'#c8211e',borderRadius:12,minHeight:50,alignItems:'center',justifyContent:'center'},submitText:{color:'#fff',fontWeight:'900',fontSize:16},disabled:{opacity:.45}});
