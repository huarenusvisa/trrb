import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { isAuthConfigured, supabase } from '../src/auth/supabase';
import { loginOrRegister, validateCredentials } from '../src/auth/unified-account';

export default function AuthScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const validate = () => {
    const validationError = validateCredentials(identifier, password);
    if (validationError) {
      setMessage(validationError);
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
    setMessage('');
    setBusy(true);
    try {
      const result = await loginOrRegister(identifier, password);
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      Alert.alert(result.created ? '注册成功' : '登录成功', result.created ? '账户已创建并登录，无需额外验证。' : '欢迎回来。', [
        { text: '继续', onPress: () => router.back() },
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '请稍后重试');
    } finally { setBusy(false); }
  };

  return <View style={styles.page}>
    <Stack.Screen options={{ title: '登录 / 注册', headerBackTitle: '返回' }} />
    <Text style={styles.h1}>唐人日报账户</Text>
    <Text style={styles.sub}>输入邮箱或手机号和密码。账号不存在时会自动创建并直接登录，不需要额外验证。</Text>
    <TextInput testID="auth-identifier" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder="邮箱或手机号" style={styles.input} editable={!busy} />
    <TextInput testID="auth-password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="密码（8–128位）" style={styles.input} editable={!busy} onSubmitEditing={() => void signIn()} />
    {message ? <Text testID="auth-message" accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
    {busy ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
    <Pressable testID="auth-submit" accessibilityRole="button" style={[styles.primary, busy && styles.disabled]} onPress={signIn} disabled={busy}><Text style={styles.primaryText}>{busy ? '正在登录…' : '登录 / 注册'}</Text></Pressable>
    <Pressable style={styles.guest} onPress={() => router.back()} disabled={busy}><Text style={styles.guestText}>继续以游客身份阅读</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff',padding:22,paddingTop:60},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{fontSize:15,lineHeight:23,color:'#667085',marginTop:8,marginBottom:28},input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:14,fontSize:16,marginBottom:12},error:{color:'#b42318',backgroundColor:'#fff1f0',padding:12,borderRadius:10,marginBottom:12,lineHeight:20},primary:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:15,alignItems:'center',marginTop:4},disabled:{opacity:0.65},primaryText:{color:'#fff',fontWeight:'800',fontSize:16},guest:{paddingVertical:18,alignItems:'center'},guestText:{color:'#667085',fontWeight:'700'}});
