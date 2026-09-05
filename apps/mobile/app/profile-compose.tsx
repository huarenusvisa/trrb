import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { useI18n } from '../src/i18n/I18nProvider';
import { createProfilePost } from '../src/social/posts';
import { clearProfilePostDraft, loadProfilePostDraft, saveProfilePostDraft } from '../src/storage/profilePostDraft';

export default function ProfileComposeScreen() {
  const { t } = useI18n();
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [progress, setProgress] = useState('');
  const [failure, setFailure] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCaption = useRef('');

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveProfilePostDraft(latestCaption.current).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void loadProfilePostDraft().then((draft) => {
      if (!active) return;
      if (draft) { latestCaption.current = draft.caption; setCaption(draft.caption); setDraftRestored(true); }
    }).catch(() => undefined).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveProfilePostDraft(caption).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [caption, draftReady]);

  const pick = async () => {
    setFailure('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.86, videoMaxDuration: 120 });
      if (result.canceled) return;
      const selected = result.assets || [];
      const videos = selected.filter((asset) => asset.type === 'video');
      if (videos.length && selected.length > 1) return Alert.alert(t('profileCompose.mediaConflictTitle'), t('profileCompose.mediaConflictBody'));
      setAssets(selected);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t('profileCompose.pickerFailed'));
    }
  };

  const submit = async () => {
    if (!assets.length || busy) return;
    setBusy(true); setFailure(''); setProgress(t('profileCompose.preparing'));
    try {
      await createProfilePost(caption, assets, ({ completed, total }) => {
        setProgress(completed >= total ? t('profileCompose.finishing') : t('profileCompose.uploading', { current: completed + 1, total }));
      });
      await clearProfilePostDraft();
      latestCaption.current = '';
      setCaption(''); setAssets([]); setDraftRestored(false); setProgress('');
      Alert.alert(t('profileCompose.publishedTitle'), t('profileCompose.publishedBody'), [{ text: t('profileCompose.done'), onPress: () => router.back() }]);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t('profileCompose.failed'));
      setProgress('');
    } finally { setBusy(false); }
  };

  const clearDraft = async () => {
    if (busy) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latestCaption.current = '';
    setCaption(''); setAssets([]); setDraftRestored(false); setFailure('');
    await clearProfilePostDraft().catch(() => undefined);
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: t('profileCompose.screenTitle'), headerBackTitle: t('common.back') }} />
    <Text style={styles.title}>{t('profileCompose.heading')}</Text><Text style={styles.hint}>{t('profileCompose.mediaLimits')}</Text>
    {draftRestored ? <View testID="profile-compose-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}><Text style={styles.draftNoticeTitle}>{t('profileCompose.draftRestored')}</Text><Text style={styles.draftNoticeText}>{t('profileCompose.draftRestoredBody')}</Text></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={assets.length ? t('profileCompose.reselectA11y') : t('profileCompose.selectA11y')} accessibilityState={{ disabled: busy }} disabled={busy} style={styles.picker} onPress={() => void pick()}><Text style={styles.pickerIcon}>＋</Text><Text style={styles.pickerText}>{assets.length ? t('profileCompose.reselect') : t('profileCompose.select')}</Text></Pressable>
    {assets.length ? <View style={styles.previewGrid}>{assets.map((asset, index) => <View key={`${asset.assetId || asset.uri}-${index}`} style={styles.previewWrap}>
      {asset.type === 'video' ? <View style={styles.videoPreview}><Text style={styles.videoIcon}>▶</Text><Text style={styles.videoText}>{t('profileCompose.videoDuration', { seconds: Math.ceil((asset.duration || 0) / 1000) })}</Text></View> : <Image source={{ uri: asset.uri }} contentFit="cover" style={styles.preview} />}
    </View>)}<Pressable accessibilityRole="button" accessibilityLabel={t('profileCompose.clearMedia')} disabled={busy} style={styles.clearMedia} onPress={() => setAssets([])}><Text style={styles.clearMediaText}>{t('profileCompose.clearMedia')}</Text></Pressable></View> : null}
    <View style={styles.labelRow}><Text style={styles.label}>{t('profileCompose.caption')}</Text>{caption || assets.length ? <Pressable accessibilityRole="button" accessibilityLabel={t('profileCompose.clearDraft')} disabled={busy} onPress={() => void clearDraft()}><Text style={styles.clearDraft}>{t('profileCompose.clearDraft')}</Text></Pressable> : null}</View>
    <TextInput testID="profile-compose-caption" accessibilityLabel={t('profileCompose.captionA11y')} value={caption} onChangeText={(value) => { latestCaption.current = value; setCaption(value); setDraftRestored(false); }} editable={!busy} maxLength={2000} multiline textAlignVertical="top" placeholder={t('profileCompose.captionPlaceholder')} style={styles.input} /><Text style={styles.counter}>{t('profileCompose.draftCounter', { count: caption.length })}</Text>
    <Text style={styles.notice}>{t('profileCompose.privacyNotice')}</Text>
    {failure ? <AsyncStatePanel testID="profile-compose-error" title={t('profileCompose.incomplete')} message={`${failure} ${t('profileCompose.failurePreserved')}`} tone="error" actionLabel={assets.length ? t('profileCompose.retry') : t('profileCompose.reselectMedia')} onAction={assets.length ? () => void submit() : () => void pick()} busy={busy} /> : null}
    {progress ? <Text testID="profile-compose-progress" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.progress}>{progress}</Text> : null}
    <Pressable testID="profile-compose-submit" accessibilityRole="button" accessibilityLabel={t('profileCompose.submit')} accessibilityState={{ disabled: busy || !assets.length, busy }} disabled={busy || !assets.length} onPress={() => void submit()} style={[styles.submit, (busy || !assets.length) && styles.disabled]}>{busy ? <><ActivityIndicator color="#fff" /><Text style={styles.busyText}>{progress || t('profileCompose.publishing')}</Text></> : <Text style={styles.submitText}>{t('profileCompose.submit')}</Text>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:18,paddingBottom:50,gap:12},title:{fontSize:28,fontWeight:'900',color:'#101828'},hint:{color:'#667085',lineHeight:21,marginTop:6,marginBottom:6},draftNotice:{backgroundColor:'#ecfdf3',borderWidth:1,borderColor:'#abefc6',borderRadius:12,padding:12},draftNoticeTitle:{color:'#067647',fontWeight:'900'},draftNoticeText:{color:'#067647',lineHeight:20,marginTop:3},picker:{height:130,borderWidth:1.5,borderStyle:'dashed',borderColor:'#98a2b3',borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},pickerIcon:{fontSize:34,color:'#c8211e'},pickerText:{fontWeight:'900',color:'#344054',marginTop:4},previewGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},previewWrap:{width:'48%',aspectRatio:1,borderRadius:12,overflow:'hidden'},preview:{width:'100%',height:'100%'},videoPreview:{flex:1,backgroundColor:'#101828',alignItems:'center',justifyContent:'center'},videoIcon:{color:'#fff',fontSize:32},videoText:{color:'#fff',fontWeight:'800',marginTop:8},clearMedia:{minHeight:44,justifyContent:'center',paddingHorizontal:6},clearMediaText:{color:'#b42318',fontWeight:'800'},labelRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:6},label:{fontWeight:'900',color:'#344054'},clearDraft:{color:'#b42318',fontWeight:'800',paddingVertical:10},input:{minHeight:130,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:13,padding:13,fontSize:16,color:'#101828'},counter:{textAlign:'right',color:'#98a2b3'},notice:{backgroundColor:'#fffaeb',color:'#7a2e0e',padding:12,borderRadius:10,lineHeight:20},progress:{color:'#344054',fontWeight:'800',textAlign:'center'},submit:{minHeight:52,backgroundColor:'#c8211e',paddingVertical:15,borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},disabled:{opacity:.45},submitText:{color:'#fff',fontWeight:'900',fontSize:16},busyText:{color:'#fff',fontWeight:'800'}
});
