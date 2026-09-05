import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getPushPreferences, PushPreferences, updatePushPreferences } from '../src/push/preferences';
import { disableCurrentDevicePushToken, getPushPermissionStatus, hasCurrentDevicePushToken, registerPushToken } from '../src/push/registration';

const OPTIONS: { key: keyof PushPreferences; title: string; description: string }[] = [
  { key: 'breaking_news', title: '重大新闻', description: '重要突发与头条更新' },
  { key: 'ice', title: 'ICE 动态', description: '执法、拘留与政策变化' },
  { key: 'immigration', title: '移民资讯', description: '签证、庇护与移民政策' },
  { key: 'legal', title: '判例新规', description: '法院判例与法规更新' },
  { key: 'comments', title: '评论与回复', description: '新闻及社区评论的新回复' },
  { key: 'likes', title: '点赞', description: '新闻评论、帖子及社区评论获赞' },
  { key: 'follows', title: '关注动态', description: '新关注、关注申请及通过结果' },
  { key: 'messages', title: '私信', description: '聊天申请及新消息' },
  { key: 'moderation', title: '审核结果', description: '社区举报处理结果' }
];

export default function PushSettingsScreen() {
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof PushPreferences | null>(null);

  useEffect(() => {
    Promise.all([getPushPreferences(), getPushPermissionStatus(), hasCurrentDevicePushToken()]).then(([nextPreferences, nextPermission, hasToken]) => {
      setPreferences(nextPreferences);
      setPermission(nextPermission.status);
      setCanAskAgain(nextPermission.canAskAgain);
      setEnabled(nextPermission.status === 'granted' && hasToken);
    }).catch((error) => Alert.alert('无法读取推送设置', error instanceof Error ? error.message : '请稍后重试')).finally(() => setBusy(false));
  }, []);

  const enablePush = async () => {
    setBusy(true);
    try {
      const token = await registerPushToken({ requestPermission: true });
      const nextPermission = await getPushPermissionStatus();
      setPermission(nextPermission.status);
      setCanAskAgain(nextPermission.canAskAgain);
      setEnabled(Boolean(token));
      if (!token) {
        Alert.alert('通知尚未开启', nextPermission.canAskAgain ? '请允许唐人日报发送通知。' : '请在系统设置中允许唐人日报发送通知。');
      }
    } catch (error) {
      Alert.alert('开启失败', error instanceof Error ? error.message : '请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      await disableCurrentDevicePushToken();
      setEnabled(false);
    } catch (error) {
      Alert.alert('关闭失败', error instanceof Error ? error.message : '请检查网络后重试');
    } finally {
      setBusy(false);
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
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <ScrollView testID="screen-push-settings" style={styles.page} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ 返回</Text></Pressable>
      <Text style={styles.h1}>推送设置</Text>
      <Text style={styles.sub}>只接收你关心的唐人日报更新，可随时关闭。</Text>
      <View style={styles.card}>
        <View style={styles.rowText}>
          <Text style={styles.title}>允许本设备接收通知</Text>
          <Text testID="push-device-status" style={styles.meta}>{enabled ? '已开启' : permission === 'denied' ? '系统权限未开启' : '未开启'}</Text>
        </View>
        {busy ? <ActivityIndicator /> : <Switch testID="push-device-toggle" value={enabled} onValueChange={(value) => void (value ? enablePush() : disablePush())} trackColor={{ true: '#c8211e' }} />}
      </View>
      {!enabled && permission === 'denied' && !canAskAgain ? <Pressable testID="open-system-settings" style={styles.settingsButton} onPress={() => void Linking.openSettings()}><Text style={styles.settingsButtonText}>打开系统通知设置</Text></Pressable> : null}
      <Text style={styles.section}>通知类型</Text>
      {preferences ? OPTIONS.map((option) => (
        <View key={option.key} style={styles.card}>
          <View style={styles.rowText}><Text style={styles.title}>{option.title}</Text><Text style={styles.meta}>{option.description}</Text></View>
          <Switch testID={`push-preference-${option.key}`} disabled={savingKey !== null} value={preferences[option.key]} onValueChange={(value) => void togglePreference(option.key, value)} trackColor={{ true: '#c8211e' }} />
        </View>
      )) : null}
      <Text style={styles.footnote}>关闭本设备通知不会影响你在其他设备上的设置。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:18,paddingTop:58,paddingBottom:40},back:{color:'#c8211e',fontSize:17,fontWeight:'700',marginBottom:18},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:8,marginBottom:22,lineHeight:21},section:{fontWeight:'800',color:'#475467',marginTop:18,marginBottom:10},card:{backgroundColor:'#fff',borderRadius:14,padding:17,marginBottom:12,flexDirection:'row',alignItems:'center',gap:14},rowText:{flex:1},title:{fontSize:17,fontWeight:'800',color:'#101828'},meta:{color:'#667085',marginTop:5,lineHeight:19},settingsButton:{borderWidth:1,borderColor:'#c8211e',borderRadius:12,padding:13,alignItems:'center',marginBottom:8},settingsButtonText:{color:'#c8211e',fontWeight:'800'},footnote:{color:'#98a2b3',lineHeight:20,marginTop:10}
});
