import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { isAuthConfigured, supabase } from '../../src/auth/supabase';
import { accountLabel } from '../../src/auth/unified-account';
import { unreadNotificationCount } from '../../src/community/notifications';
import { getReadingPreferences, ReadingPreferences, setReadingFontScale } from '../../src/storage/reading-preferences';

const FONT_OPTIONS: { label: string; scale: ReadingPreferences['fontScale'] }[] = [
  { label: '小', scale: 0.9 },
  { label: '标准', scale: 1 },
  { label: '大', scale: 1.15 },
  { label: '特大', scale: 1.3 },
];

export default function ProfileScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [fontScale, setFontScale] = useState<ReadingPreferences['fontScale']>(1);

  useEffect(() => {
    void getReadingPreferences().then((prefs) => setFontScale(prefs.fontScale));
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
        if (data.session) setUnread(await unreadNotificationCount().catch(() => 0));
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      setUnread(nextSession ? await unreadNotificationCount().catch(() => 0) : 0);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('退出失败', error.message);
  };

  const updateFontScale = async (scale: ReadingPreferences['fontScale']) => {
    setFontScale(scale);
    await setReadingFontScale(scale);
  };

  return (
    <ScrollView testID="screen-profile" style={styles.page} contentContainerStyle={styles.pageContent}>
      <Text style={styles.h1}>我的</Text>
      {loading ? <ActivityIndicator style={styles.loader} /> : session ? <>
        <Text testID="account-status" style={styles.sub}>已登录 · {accountLabel(session.user)}</Text>
        <Pressable testID="open-community" style={styles.item} onPress={()=>router.push('/community')}><Text style={styles.title}>移民社区</Text><Text style={styles.meta}>浏览帖子、分享经历和发布问题</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/notifications')}><Text style={styles.title}>消息中心{unread ? ` · ${unread}条未读` : ''}</Text><Text style={styles.meta}>回复、点赞、关注与系统通知</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/my-comments')}><Text style={styles.title}>我的评论</Text><Text style={styles.meta}>查看评论状态并返回对应新闻</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/favorites')}><Text style={styles.title}>收藏</Text><Text style={styles.meta}>查看新闻收藏；云端同步将在本批后续节点接入</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/history')}><Text style={styles.title}>阅读历史</Text><Text style={styles.meta}>最近阅读的新闻，最多保存100条</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/profile-settings')}><Text style={styles.title}>账号设置</Text><Text style={styles.meta}>修改昵称、默认头像与公开简介</Text></Pressable>
        <Pressable testID="profile-sign-out" style={styles.signOut} onPress={signOut}><Text style={styles.signOutText}>退出登录</Text></Pressable>
      </> : <>
        <Text style={styles.sub}>游客模式 · 无需注册即可阅读全部公开内容</Text>
        {!isAuthConfigured ? <Text style={styles.warning}>当前构建尚未配置生产身份服务环境变量。</Text> : null}
        <Pressable testID="profile-login" style={styles.login} onPress={()=>router.push('/auth')}><Text style={styles.loginText}>登录 / 创建账户</Text></Pressable>
        <Pressable testID="open-community-guest" style={styles.item} onPress={()=>router.push('/community')}><Text style={styles.title}>移民社区</Text><Text style={styles.meta}>浏览无需登录；发帖时再登录或注册</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/favorites')}><Text style={styles.title}>本机收藏</Text><Text style={styles.meta}>登录前继续保存在当前设备</Text></Pressable>
        <Pressable style={styles.item} onPress={()=>router.push('/history')}><Text style={styles.title}>本机阅读历史</Text><Text style={styles.meta}>登录前继续保存在当前设备</Text></Pressable>
      </>}
      <View style={styles.item}>
        <Text style={styles.title}>阅读字号</Text>
        <Text style={styles.meta}>统一设置新闻正文大小，之后所有新闻详情页自动使用此字号</Text>
        <View style={styles.fontRow}>
          {FONT_OPTIONS.map((option) => (
            <Pressable key={option.scale} onPress={() => void updateFontScale(option.scale)} style={[styles.fontOption, fontScale === option.scale && styles.fontOptionActive]}>
              <Text style={[styles.fontOptionText, fontScale === option.scale && styles.fontOptionTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable style={styles.item}><Text style={styles.title}>推送设置</Text><Text style={styles.meta}>重大新闻 · ICE · 移民 · 判例新规（下一阶段接入）</Text></Pressable>
      <Pressable style={styles.item} onPress={() => Linking.openURL('https://trrb.net')}><Text style={styles.title}>打开 trrb.net</Text><Text style={styles.meta}>访问唐人日报网站</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},pageContent:{padding:16,paddingTop:58,paddingBottom:40},h1:{fontSize:32,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},loader:{marginVertical:20},warning:{backgroundColor:'#fff4e5',color:'#8a4b08',padding:12,borderRadius:10,marginBottom:12},item:{backgroundColor:'#fff',padding:18,borderRadius:14,marginBottom:12},title:{fontSize:18,fontWeight:'800',color:'#101828'},meta:{color:'#98a2b3',marginTop:6},fontRow:{flexDirection:'row',gap:8,marginTop:14},fontOption:{flex:1,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingVertical:10,alignItems:'center',backgroundColor:'#fff'},fontOptionActive:{backgroundColor:'#c8211e',borderColor:'#c8211e'},fontOptionText:{fontWeight:'800',color:'#475467'},fontOptionTextActive:{color:'#fff'},login:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center',marginBottom:14},loginText:{color:'#fff',fontWeight:'800',fontSize:16},signOut:{borderWidth:1,borderColor:'#d0d5dd',padding:14,borderRadius:12,alignItems:'center',marginBottom:12},signOutText:{color:'#475467',fontWeight:'800'}});
