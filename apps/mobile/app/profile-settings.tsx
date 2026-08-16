import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/auth/supabase';
import { TrRbAvatar } from '../src/components/TrRbAvatar';

type Profile = {
  id: string;
  display_name: string;
  avatar_key: string;
  bio: string;
};

function avatarNumber(key: string) {
  const match = key.match(/^avatar_(\d{3})$/);
  return match ? Math.min(120, Math.max(1, Number(match[1]))) : 1;
}

function avatarKey(n: number) {
  return `avatar_${String(((n - 1 + 120) % 120) + 1).padStart(3, '0')}`;
}

export default function ProfileSettingsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('avatar_001');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setLoading(false);
        router.replace('/auth');
        return;
      }
      const { data, error } = await supabase.from('profiles').select('id,display_name,avatar_key,bio').eq('id', user.id).single();
      if (error) {
        Alert.alert('读取资料失败', error.message);
      } else if (data) {
        const next = data as Profile;
        setProfile(next);
        setName(next.display_name);
        setBio(next.bio || '');
        setAvatar(next.avatar_key);
      }
      setLoading(false);
    })();
  }, []);

  const dirty = useMemo(() => Boolean(profile && (name.trim() !== profile.display_name || bio.trim() !== profile.bio || avatar !== profile.avatar_key)), [profile, name, bio, avatar]);

  const save = async () => {
    const trimmedName = name.trim();
    const trimmedBio = bio.trim();
    if (trimmedName.length < 2 || trimmedName.length > 32) {
      Alert.alert('昵称不符合要求', '昵称长度需为 2–32 个字符。');
      return;
    }
    if (trimmedBio.length > 240) {
      Alert.alert('简介过长', '个人简介最多 240 个字符。');
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSaving(false);
      router.replace('/auth');
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: trimmedName, bio: trimmedBio, avatar_key: avatar })
      .eq('id', userId)
      .select('id,display_name,avatar_key,bio')
      .single();
    setSaving(false);
    if (error) {
      const msg = error.message.includes('display_name_reserved') ? '该昵称属于保留身份词，不能使用。' :
        error.message.includes('duplicate') ? '该昵称已被其他用户使用。' : error.message;
      Alert.alert('保存失败', msg);
      return;
    }
    setProfile(data as Profile);
    setName(data.display_name);
    setBio(data.bio || '');
    setAvatar(data.avatar_key);
    Alert.alert('已保存', '个人资料已同步到统一账户。');
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!profile) return <View style={styles.center}><Text>无法读取账户资料。</Text></View>;

  const currentAvatar = avatarNumber(avatar);
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>账号设置</Text>
      <Text style={styles.sub}>修改昵称、默认头像和公开简介</Text>

      <View style={styles.avatarRow}>
        <TrRbAvatar avatarKey={avatar} size={82} label="当前头像" />
        <View style={styles.avatarControls}>
          <Text style={styles.label}>默认头像 {currentAvatar}/120</Text>
          <View style={styles.row}>
            <Pressable style={styles.smallButton} onPress={() => setAvatar(avatarKey(currentAvatar - 1))}><Text>上一个</Text></Pressable>
            <Pressable style={styles.smallButton} onPress={() => setAvatar(avatarKey(currentAvatar + 1))}><Text>下一个</Text></Pressable>
          </View>
        </View>
      </View>

      <Text style={styles.label}>昵称</Text>
      <TextInput value={name} onChangeText={setName} maxLength={32} style={styles.input} placeholder="2–32个字符" autoCapitalize="none" />
      <Text style={styles.counter}>{name.trim().length}/32</Text>

      <Text style={styles.label}>公开简介</Text>
      <TextInput value={bio} onChangeText={setBio} maxLength={240} style={[styles.input, styles.bio]} placeholder="介绍一下自己" multiline textAlignVertical="top" />
      <Text style={styles.counter}>{bio.trim().length}/240</Text>

      <Pressable disabled={!dirty || saving} style={[styles.save, (!dirty || saving) && styles.disabled]} onPress={save}>
        <Text style={styles.saveText}>{saving ? '保存中…' : '保存修改'}</Text>
      </Pressable>
      <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>返回</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f5f6f8'},
  page:{backgroundColor:'#f5f6f8',padding:18,paddingTop:58,paddingBottom:40,minHeight:'100%'},
  h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:24},
  avatarRow:{backgroundColor:'#fff',borderRadius:16,padding:18,flexDirection:'row',alignItems:'center',marginBottom:22},
  avatarControls:{marginLeft:18,flex:1},label:{fontWeight:'800',color:'#344054',marginBottom:8},row:{flexDirection:'row',gap:8},
  smallButton:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingHorizontal:12,paddingVertical:9,backgroundColor:'#fff'},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:13,fontSize:16,color:'#101828'},
  bio:{height:120},counter:{textAlign:'right',color:'#98a2b3',marginTop:5,marginBottom:18},
  save:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center'},disabled:{opacity:.45},saveText:{color:'#fff',fontWeight:'900',fontSize:16},
  back:{padding:14,alignItems:'center',marginTop:8},backText:{color:'#475467',fontWeight:'800'}
});
