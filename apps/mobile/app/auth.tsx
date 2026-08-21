import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { isAuthConfigured, supabase } from '../src/auth/supabase';

export default function AuthScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = () => {
    if (!identifier.trim() || !password) {
      Alert.alert('请填写完整', '请输入邮箱或手机号和密码。');
      return false;
    }
    if (password.length < 8) {
      Alert.alert('密码过短', '密码至少需要 8 位。');
      return false;
    }
    if (!isAuthConfigured) {
      Alert.alert('登录暂未配置', '当前版本尚未连接生产身份服务。');
      return false;
    }
    return true;
  };

  const signIn = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const response = await fetch('https://trrb.net/.netlify/functions/unified-account-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '登录失败');
      const { error } = await supabase.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
      if (error) throw error;
      router.back();
    } catch (error) {
      Alert.alert('登录失败', error instanceof Error ? error.message : '请稍后重试');
    } finally { setBusy(false); }
  };

  return <View style={styles.page}>
    <Stack.Screen options={{ title: '登录 / 注册', headerBackTitle: '返回' }} />
    <Text style={styles.h1}>唐人日报账户</Text>
    <Text style={styles.sub}>输入邮箱或手机号和密码。账号不存在时会自动创建并直接登录，不需要额外验证。</Text>
    <TextInput value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoComplete="username" placeholder="邮箱或手机号" style={styles.input} editable={!busy} />
    <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="密码（至少8位）" style={styles.input} editable={!busy} />
    {busy ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
    <Pressable style={styles.primary} onPress={signIn} disabled={busy}><Text style={styles.primaryText}>登录 / 注册</Text></Pressable>
    <Pressable style={styles.guest} onPress={() => router.back()} disabled={busy}><Text style={styles.guestText}>继续以游客身份阅读</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff',padding:22,paddingTop:60},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{fontSize:15,lineHeight:23,color:'#667085',marginTop:8,marginBottom:28},input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:14,fontSize:16,marginBottom:12},primary:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:15,alignItems:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'800',fontSize:16},guest:{paddingVertical:18,alignItems:'center'},guestText:{color:'#667085',fontWeight:'700'}});
