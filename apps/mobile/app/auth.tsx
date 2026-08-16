import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { isAuthConfigured, supabase } from '../src/auth/supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const validate = () => {
    if (!email.trim() || !password) {
      Alert.alert('请填写完整', '请输入邮箱和密码。');
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return Alert.alert('登录失败', error.message);
    router.back();
  };

  const signUp = async () => {
    if (!validate()) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) return Alert.alert('注册失败', error.message);
    if (data.session) router.back();
    else Alert.alert('请验证邮箱', '注册请求已提交，请按邮箱中的验证提示完成注册后再登录。');
  };

  return <View style={styles.page}>
    <Stack.Screen options={{ title: '登录 / 注册', headerBackTitle: '返回' }} />
    <Text style={styles.h1}>唐人日报账户</Text>
    <Text style={styles.sub}>游客无需登录即可阅读；登录后可评论、收藏并跨设备同步。</Text>
    <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="邮箱" style={styles.input} editable={!busy} />
    <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="密码（至少8位）" style={styles.input} editable={!busy} />
    {busy ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
    <Pressable style={styles.primary} onPress={signIn} disabled={busy}><Text style={styles.primaryText}>登录</Text></Pressable>
    <Pressable style={styles.secondary} onPress={signUp} disabled={busy}><Text style={styles.secondaryText}>创建账户</Text></Pressable>
    <Pressable style={styles.guest} onPress={() => router.back()} disabled={busy}><Text style={styles.guestText}>继续以游客身份阅读</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff',padding:22,paddingTop:60},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{fontSize:15,lineHeight:23,color:'#667085',marginTop:8,marginBottom:28},input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:14,fontSize:16,marginBottom:12},primary:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:15,alignItems:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'800',fontSize:16},secondary:{borderWidth:1,borderColor:'#c8211e',borderRadius:12,paddingVertical:14,alignItems:'center',marginTop:12},secondaryText:{color:'#c8211e',fontWeight:'800',fontSize:16},guest:{paddingVertical:18,alignItems:'center'},guestText:{color:'#667085',fontWeight:'700'}});
