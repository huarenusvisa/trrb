import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { createProfilePost } from '../src/social/posts';

export default function ProfileComposeScreen() {
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.86, videoMaxDuration: 120 });
    if (result.canceled) return;
    const selected = result.assets || [];
    const videos = selected.filter((asset) => asset.type === 'video');
    if (videos.length && selected.length > 1) return Alert.alert('请选择一种形式', '一条视频需要单独发布；图片可以一次选择最多 4 张。');
    setAssets(selected);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await createProfilePost(caption, assets);
      Alert.alert('发布成功', '动态已经显示在你的个人主页。', [{ text: '完成', onPress: () => router.back() }]);
    } catch (error) { Alert.alert('发布失败', error instanceof Error ? error.message : '请稍后重试。'); }
    finally { setBusy(false); }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: '发布主页动态', headerBackTitle: '返回' }} />
    <Text style={styles.title}>分享图片或视频</Text><Text style={styles.hint}>图片最多 4 张；视频每条 1 个、最长 2 分钟、最大 80MB。</Text>
    <Pressable style={styles.picker} onPress={() => void pick()}><Text style={styles.pickerIcon}>＋</Text><Text style={styles.pickerText}>{assets.length ? '重新选择' : '从相册选择'}</Text></Pressable>
    {assets.length ? <View style={styles.previewGrid}>{assets.map((asset, index) => <View key={`${asset.assetId || asset.uri}-${index}`} style={styles.previewWrap}>
      {asset.type === 'video' ? <View style={styles.videoPreview}><Text style={styles.videoIcon}>▶</Text><Text style={styles.videoText}>视频 · {Math.ceil((asset.duration || 0) / 1000)} 秒</Text></View> : <Image source={{ uri: asset.uri }} contentFit="cover" style={styles.preview} />}
    </View>)}</View> : null}
    <Text style={styles.label}>文字说明（可选）</Text><TextInput value={caption} onChangeText={setCaption} maxLength={2000} multiline textAlignVertical="top" placeholder="说点什么……" style={styles.input} /><Text style={styles.counter}>{caption.trim().length}/2000</Text>
    <Text style={styles.notice}>请确认内容不包含他人的电话、证件、详细住址或未成年人隐私。</Text>
    <Pressable disabled={busy || !assets.length} onPress={() => void submit()} style={[styles.submit, (busy || !assets.length) && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>发布到我的主页</Text>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:18,paddingBottom:50},title:{fontSize:28,fontWeight:'900',color:'#101828'},hint:{color:'#667085',lineHeight:21,marginTop:6,marginBottom:18},picker:{height:130,borderWidth:1.5,borderStyle:'dashed',borderColor:'#98a2b3',borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},pickerIcon:{fontSize:34,color:'#c8211e'},pickerText:{fontWeight:'900',color:'#344054',marginTop:4},previewGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:12},previewWrap:{width:'48%',aspectRatio:1,borderRadius:12,overflow:'hidden'},preview:{width:'100%',height:'100%'},videoPreview:{flex:1,backgroundColor:'#101828',alignItems:'center',justifyContent:'center'},videoIcon:{color:'#fff',fontSize:32},videoText:{color:'#fff',fontWeight:'800',marginTop:8},label:{fontWeight:'900',color:'#344054',marginTop:22,marginBottom:8},input:{minHeight:130,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:13,padding:13,fontSize:16,color:'#101828'},counter:{textAlign:'right',color:'#98a2b3',marginTop:5},notice:{backgroundColor:'#fffaeb',color:'#7a2e0e',padding:12,borderRadius:10,lineHeight:20,marginTop:14},submit:{backgroundColor:'#c8211e',paddingVertical:15,borderRadius:12,alignItems:'center',marginTop:16},disabled:{opacity:.45},submitText:{color:'#fff',fontWeight:'900',fontSize:16}
});
