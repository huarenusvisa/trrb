import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { CommunityCategory, createCommunityPost } from '../src/api/community';

const categories: { value: CommunityCategory; label: string }[] = [
  { value: 'uscis_interview', label: 'USCIS 面谈' },
  { value: 'court_experience', label: '上庭交流' },
  { value: 'immigration_help', label: '移民互助' },
  { value: 'hot_discussion', label: '热门讨论' },
  { value: 'ice_experience', label: 'ICE 经历' },
  { value: 'lawyer_review', label: '律师点评' },
  { value: 'tipoff', label: '投稿爆料' },
];

export default function CommunityComposeScreen() {
  const [category, setCategory] = useState<CommunityCategory>('uscis_interview');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (title.trim().length < 4) return setMessage('标题至少需要 4 个字。');
    if (content.trim().length < 20) return setMessage('正文至少需要 20 个字。');
    if (!privacyConfirmed) return setMessage('请先确认已经移除个人隐私信息。');
    setBusy(true);
    setMessage('正在检查并提交…');
    try {
      const result = await createCommunityPost({
        category,
        content_label: 'personal_experience',
        title: title.trim(),
        content: content.trim(),
      });
      setMessage(result.message === '发布成功' ? '发布成功，正在返回社区。' : result.message);
      setTimeout(() => router.replace('/community'), 500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '发布失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: '发布社区帖子', headerBackTitle: '返回' }} />
    <Text style={styles.title}>分享经历或提出问题</Text>
    <Text style={styles.hint}>请勿填写 A-Number、电话、详细住址或未成年人信息。</Text>
    <Text style={styles.label}>选择板块</Text>
    <View style={styles.categories}>{categories.map((item) =>
      <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.category, category === item.value && styles.categoryActive]}>
        <Text style={[styles.categoryText, category === item.value && styles.categoryTextActive]}>{item.label}</Text>
      </Pressable>
    )}</View>
    <Text style={styles.label}>标题</Text>
    <TextInput testID="community-title-input" value={title} onChangeText={setTitle} maxLength={120} placeholder="一句话说明你想分享什么" style={styles.input} editable={!busy} />
    <Text style={styles.label}>正文</Text>
    <TextInput testID="community-content-input" value={content} onChangeText={setContent} maxLength={12000} multiline placeholder="尽量写清时间、地区、流程、问题、材料和结果" style={[styles.input, styles.textarea]} editable={!busy} />
    <Pressable testID="community-privacy-confirm" onPress={() => setPrivacyConfirmed((value) => !value)} style={styles.confirm}>
      <View style={[styles.checkbox, privacyConfirmed && styles.checkboxChecked]}><Text style={styles.checkmark}>{privacyConfirmed ? '✓' : ''}</Text></View>
      <Text style={styles.confirmText}>我已移除个人号码、电话、详细住址和未成年人隐私。</Text>
    </Pressable>
    {message ? <Text testID="community-compose-message" style={[styles.message, message.startsWith('发布成功') && styles.success]}>{message}</Text> : null}
    <Pressable testID="community-submit" onPress={() => void submit()} disabled={busy} style={[styles.submit, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>提交帖子</Text>}
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:50},title:{fontSize:28,fontWeight:'900',color:'#101828'},hint:{color:'#667085',lineHeight:21,marginTop:7,marginBottom:20},label:{fontSize:15,fontWeight:'900',color:'#344054',marginTop:16,marginBottom:8},categories:{flexDirection:'row',flexWrap:'wrap',gap:8},category:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:999,paddingHorizontal:12,paddingVertical:8},categoryActive:{backgroundColor:'#c8211e',borderColor:'#c8211e'},categoryText:{color:'#475467',fontWeight:'800'},categoryTextActive:{color:'#fff'},input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:13,paddingVertical:12,fontSize:16,color:'#101828'},textarea:{minHeight:190,textAlignVertical:'top'},confirm:{flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:20},checkbox:{width:22,height:22,borderWidth:1,borderColor:'#98a2b3',borderRadius:5,alignItems:'center',justifyContent:'center'},checkboxChecked:{backgroundColor:'#c8211e',borderColor:'#c8211e'},checkmark:{color:'#fff',fontWeight:'900'},confirmText:{flex:1,color:'#475467',lineHeight:21},message:{marginTop:16,color:'#b42318',fontWeight:'700'},success:{color:'#067647'},submit:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:15,alignItems:'center',marginTop:18},disabled:{opacity:.65},submitText:{color:'#fff',fontWeight:'900',fontSize:16}
});
