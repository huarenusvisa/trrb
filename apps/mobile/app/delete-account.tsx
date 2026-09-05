import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { supabase } from '../src/auth/supabase';
import { useI18n } from '../src/i18n/I18nProvider';

export default function DeleteAccountScreen() {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (confirm.trim() !== 'DELETE') {
      Alert.alert(t('deleteAccount.confirmRequired'), t('deleteAccount.confirmRequiredBody'));
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return router.replace('/auth');
    setBusy(true);
    try {
      const response = await fetch('/.netlify/functions/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE', source: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'app' })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || t('deleteAccount.requestFailed'));
      await supabase.auth.signOut();
      Alert.alert(t('deleteAccount.deleted'), t('deleteAccount.deletedBody'));
      router.replace('/');
    } catch (error) {
      Alert.alert(t('deleteAccount.requestFailed'), error instanceof Error ? error.message : t('deleteAccount.retryLater'));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || confirm.trim() !== 'DELETE';
  return <><Stack.Screen options={{ title: t('deleteAccount.screenTitle'), headerBackTitle: t('common.back') }} /><View style={styles.page}>
    <Text style={styles.h1}>{t('deleteAccount.heading')}</Text>
    <Text style={styles.body}>{t('deleteAccount.description')}</Text>
    <Text style={styles.warning}>{t('deleteAccount.irreversible')}</Text>
    <Text style={styles.label}>{t('deleteAccount.confirmLabel')}</Text>
    <TextInput accessibilityLabel={t('deleteAccount.confirmInputA11y')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} style={styles.input} editable={!busy} />
    <Pressable accessibilityRole="button" accessibilityLabel={t('deleteAccount.deleteA11y')} accessibilityState={{ disabled, busy }} style={[styles.delete, disabled && styles.disabled]} disabled={disabled} onPress={remove}>
      <Text style={styles.deleteText}>{busy ? t('deleteAccount.deleting') : t('deleteAccount.delete')}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={t('deleteAccount.cancelA11y')} accessibilityState={{ disabled: busy }} style={styles.cancel} onPress={() => router.back()} disabled={busy}><Text style={styles.cancelText}>{t('deleteAccount.cancel')}</Text></Pressable>
  </View></>;
}

const styles = StyleSheet.create({
  page:{flex:1,padding:20,paddingTop:64,backgroundColor:'#f5f6f8'},
  h1:{fontSize:30,fontWeight:'900',color:'#101828'},
  body:{marginTop:18,fontSize:16,lineHeight:25,color:'#475467'},
  warning:{marginTop:18,fontWeight:'900',color:'#b42318'},
  label:{marginTop:28,marginBottom:8,fontWeight:'800',color:'#344054'},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:14,fontSize:16},
  delete:{marginTop:18,backgroundColor:'#b42318',padding:15,borderRadius:12,alignItems:'center'},
  disabled:{opacity:.45},deleteText:{color:'#fff',fontWeight:'900'},
  cancel:{padding:15,alignItems:'center',marginTop:8},cancelText:{color:'#475467',fontWeight:'800'}
});
