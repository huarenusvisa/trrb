import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/auth/supabase';

export default function DeleteAccountScreen() {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (confirm.trim() !== 'DELETE') {
      Alert.alert('需要确认', '请输入 DELETE 后才能永久删除账户。');
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
      if (!response.ok) throw new Error(body.error || '删除失败');
      await supabase.auth.signOut();
      Alert.alert('账户已删除', '账户与关联个人数据已永久删除。');
      router.replace('/');
    } catch (error) {
      Alert.alert('删除失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.page}>
    <Text style={styles.h1}>删除账户</Text>
    <Text style={styles.body}>此操作会永久删除登录账户以及与该账户关联的个人资料、评论、收藏、阅读历史、通知偏好、屏蔽和举报等个人数据。为安全与合规，仅保留最小化的删除完成证明，不保留账户正文内容。</Text>
    <Text style={styles.warning}>此操作不可撤销。</Text>
    <Text style={styles.label}>输入 DELETE 确认</Text>
    <TextInput value={confirm} onChangeText={setConfirm} autoCapitalize="characters" style={styles.input} editable={!busy} />
    <Pressable style={[styles.delete, (busy || confirm.trim() !== 'DELETE') && styles.disabled]} disabled={busy || confirm.trim() !== 'DELETE'} onPress={remove}>
      <Text style={styles.deleteText}>{busy ? '正在删除…' : '永久删除账户'}</Text>
    </Pressable>
    <Pressable style={styles.cancel} onPress={() => router.back()} disabled={busy}><Text style={styles.cancelText}>取消</Text></Pressable>
  </View>;
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
