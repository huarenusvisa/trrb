import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { useI18n } from '../src/i18n/I18nProvider';
import { createProfilePost } from '../src/social/posts';
import { currentUserId } from '../src/social/profiles';
import { clearProfilePostDraft, deleteProfilePostDraft, loadProfilePostDrafts, saveProfilePostDraft } from '../src/storage/profilePostDraft';
import type { ProfilePostDraft } from '../src/storage/profile-post-draft-core';

export default function ProfileComposeScreen() {
  const { t } = useI18n();
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [drafts, setDrafts] = useState<ProfilePostDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [failure, setFailure] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCaption = useRef('');
  const latestTagsText = useRef('');
  const activeDraftIdRef = useRef<string | null>(null);
  const draftUserId = useRef<string | null>(null);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (draftUserId.current) void saveProfilePostDraft(draftUserId.current, latestCaption.current, latestTagsText.current, activeDraftIdRef.current).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void currentUserId().then((userId) => {
      draftUserId.current = userId;
      return loadProfilePostDrafts(userId);
    }).then((savedDrafts) => {
      if (!active) return;
      setDrafts(savedDrafts);
      const draft = savedDrafts[0];
      if (draft) {
        latestCaption.current = draft.caption;
        latestTagsText.current = draft.tagsText;
        activeDraftIdRef.current = draft.id;
        setActiveDraftId(draft.id);
        setCaption(draft.caption);
        setTagsText(draft.tagsText);
        setDraftRestored(true);
      }
    }).catch(() => undefined).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (draftUserId.current) void saveProfilePostDraft(draftUserId.current, caption, tagsText, activeDraftIdRef.current).then(async (id) => {
        if (id && !activeDraftIdRef.current) {
          activeDraftIdRef.current = id;
          setActiveDraftId(id);
        }
        if (draftUserId.current) setDrafts(await loadProfilePostDrafts(draftUserId.current));
      }).catch(() => undefined);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [caption, tagsText, draftReady]);

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
    Keyboard.dismiss();
    setBusy(true); setFailure(''); setProgress(t('profileCompose.preparing'));
    try {
      const tags = tagsText.split(/[，,\s#]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 5);
      await createProfilePost(caption, assets, tags, ({ completed, total }) => {
        setProgress(completed >= total ? t('profileCompose.finishing') : t('profileCompose.uploading', { current: completed + 1, total }));
      });
      if (draftUserId.current && activeDraftIdRef.current) await clearProfilePostDraft(draftUserId.current, activeDraftIdRef.current);
      latestCaption.current = '';
      activeDraftIdRef.current = null;
      setActiveDraftId(null);
      setCaption(''); setTagsText(''); setAssets([]); setDraftRestored(false); setProgress('');
      if (draftUserId.current) setDrafts(await loadProfilePostDrafts(draftUserId.current));
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
    setCaption(''); setTagsText(''); setAssets([]); setDraftRestored(false); setFailure('');
    latestTagsText.current = '';
    if (draftUserId.current && activeDraftIdRef.current) await clearProfilePostDraft(draftUserId.current, activeDraftIdRef.current).catch(() => undefined);
    activeDraftIdRef.current = null;
    setActiveDraftId(null);
    if (draftUserId.current) setDrafts(await loadProfilePostDrafts(draftUserId.current));
  };

  const loadDraft = (draft: ProfilePostDraft) => {
    if (busy) return;
    activeDraftIdRef.current = draft.id;
    setActiveDraftId(draft.id);
    latestCaption.current = draft.caption;
    latestTagsText.current = draft.tagsText;
    setCaption(draft.caption);
    setTagsText(draft.tagsText);
    setAssets([]);
    setDraftRestored(true);
    setFailure('');
  };

  const newDraft = () => {
    if (busy || drafts.length >= 5) return;
    activeDraftIdRef.current = null;
    setActiveDraftId(null);
    latestCaption.current = '';
    latestTagsText.current = '';
    setCaption('');
    setTagsText('');
    setAssets([]);
    setDraftRestored(false);
    setFailure('');
  };

  const removeDraft = async (draftId: string) => {
    if (!draftUserId.current || busy) return;
    await deleteProfilePostDraft(draftUserId.current, draftId);
    const next = await loadProfilePostDrafts(draftUserId.current);
    setDrafts(next);
    if (activeDraftIdRef.current === draftId) {
      const replacement = next[0];
      if (replacement) loadDraft(replacement);
      else newDraft();
    }
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: t('profileCompose.screenTitle'), headerBackTitle: t('common.back') }} />
    <Text style={styles.title}>{t('profileCompose.heading')}</Text><Text style={styles.hint}>{t('profileCompose.mediaLimits')}</Text>
    <View style={styles.draftBox}>
      <View style={styles.draftBoxHead}>
        <View><Text style={styles.draftBoxTitle}>草稿箱</Text><Text style={styles.draftBoxMeta}>最多保留 5 个草稿 · 当前 {drafts.length}/5</Text></View>
        <Pressable accessibilityRole="button" disabled={busy || drafts.length >= 5} onPress={newDraft}><Text style={[styles.newDraft, (busy || drafts.length >= 5) && styles.newDraftDisabled]}>新建草稿</Text></Pressable>
      </View>
      {drafts.length ? drafts.map((draft) => <View key={draft.id} style={[styles.draftRow, activeDraftId === draft.id && styles.draftRowActive]}>
        <Pressable style={styles.draftMain} disabled={busy} onPress={() => loadDraft(draft)}>
          <Text numberOfLines={2} style={styles.draftPreview}>{draft.caption.trim() || draft.tagsText.trim() || '未命名草稿'}</Text>
          <Text style={styles.draftTime}>{new Date(draft.savedAt).toLocaleString()}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void removeDraft(draft.id)}><Text style={styles.deleteDraft}>删除</Text></Pressable>
      </View>) : <Text style={styles.emptyDrafts}>暂无草稿。输入内容后会自动保存。</Text>}
      <Text style={styles.draftMediaNote}>草稿保存文字和标签；为保护隐私，图片和视频不会跨会话保存。</Text>
    </View>
    {draftRestored ? <View testID="profile-compose-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}><Text style={styles.draftNoticeTitle}>{t('profileCompose.draftRestored')}</Text><Text style={styles.draftNoticeText}>{t('profileCompose.draftRestoredBody')}</Text></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={assets.length ? t('profileCompose.reselectA11y') : t('profileCompose.selectA11y')} accessibilityState={{ disabled: busy }} disabled={busy} style={styles.picker} onPress={() => void pick()}><Text style={styles.pickerIcon}>＋</Text><Text style={styles.pickerText}>{assets.length ? t('profileCompose.reselect') : t('profileCompose.select')}</Text></Pressable>
    {assets.length ? <View style={styles.previewGrid}>{assets.map((asset, index) => <View key={`${asset.assetId || asset.uri}-${index}`} style={styles.previewWrap}>
      {asset.type === 'video' ? <View style={styles.videoPreview}><Text style={styles.videoIcon}>▶</Text><Text style={styles.videoText}>{t('profileCompose.videoDuration', { seconds: Math.ceil((asset.duration || 0) / 1000) })}</Text></View> : <Image source={{ uri: asset.uri }} contentFit="cover" style={styles.preview} />}
    </View>)}<Pressable accessibilityRole="button" accessibilityLabel={t('profileCompose.clearMedia')} disabled={busy} style={styles.clearMedia} onPress={() => setAssets([])}><Text style={styles.clearMediaText}>{t('profileCompose.clearMedia')}</Text></Pressable></View> : null}
    <View style={styles.labelRow}><Text style={styles.label}>{t('profileCompose.caption')}</Text>{caption || assets.length ? <Pressable accessibilityRole="button" accessibilityLabel={t('profileCompose.clearDraft')} disabled={busy} onPress={() => void clearDraft()}><Text style={styles.clearDraft}>{t('profileCompose.clearDraft')}</Text></Pressable> : null}</View>
    <TextInput testID="profile-compose-tags" accessibilityLabel="动态标签" value={tagsText} onChangeText={(value) => { latestTagsText.current = value; setTagsText(value); setDraftRestored(false); }} editable={!busy} maxLength={220} placeholder="添加标签，用空格或逗号分隔，例如：中秋节 刘欢 一人食" style={styles.tagsInput} />
    <Text style={styles.tagsHint}>最多 5 个标签，每个标签最多 24 个字符；发布后会显示为 #标签。</Text>
    <TextInput testID="profile-compose-caption" accessibilityLabel={t('profileCompose.captionA11y')} value={caption} onChangeText={(value) => { latestCaption.current = value; setCaption(value); setDraftRestored(false); }} editable={!busy} maxLength={2000} multiline textAlignVertical="top" placeholder={t('profileCompose.captionPlaceholder')} style={styles.input} /><Text style={styles.counter}>{t('profileCompose.draftCounter', { count: caption.length })}</Text>
    <Text style={styles.notice}>{t('profileCompose.privacyNotice')}</Text>
    {failure ? <AsyncStatePanel testID="profile-compose-error" title={t('profileCompose.incomplete')} message={`${failure} ${t('profileCompose.failurePreserved')}`} tone="error" actionLabel={assets.length ? t('profileCompose.retry') : t('profileCompose.reselectMedia')} onAction={assets.length ? () => void submit() : () => void pick()} busy={busy} /> : null}
    {progress ? <Text testID="profile-compose-progress" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.progress}>{progress}</Text> : null}
    <Pressable testID="profile-compose-submit" accessibilityRole="button" accessibilityLabel={t('profileCompose.submit')} accessibilityState={{ disabled: busy || !assets.length, busy }} disabled={busy || !assets.length} onPress={() => void submit()} style={[styles.submit, (busy || !assets.length) && styles.disabled]}>{busy ? <><ActivityIndicator color="#fff" /><Text style={styles.busyText}>{progress || t('profileCompose.publishing')}</Text></> : <Text style={styles.submitText}>{t('profileCompose.submit')}</Text>}</Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:18,paddingBottom:50,gap:12},title:{fontSize:28,fontWeight:'900',color:'#101828'},hint:{color:'#667085',lineHeight:21,marginTop:6,marginBottom:6},draftBox:{backgroundColor:'#fff',borderWidth:1,borderColor:'#eaecf0',borderRadius:14,padding:12,gap:8},draftBoxHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},draftBoxTitle:{fontSize:17,fontWeight:'900',color:'#101828'},draftBoxMeta:{fontSize:12,color:'#667085',marginTop:3},newDraft:{color:'#b42318',fontWeight:'900',paddingVertical:8,paddingHorizontal:4},newDraftDisabled:{opacity:.35},draftRow:{flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:'#f2f4f7',paddingTop:8},draftRowActive:{backgroundColor:'#fff8f7',borderRadius:10,paddingHorizontal:8,paddingBottom:8},draftMain:{flex:1},draftPreview:{color:'#344054',fontWeight:'700',lineHeight:19},draftTime:{fontSize:11,color:'#98a2b3',marginTop:3},deleteDraft:{color:'#b42318',fontWeight:'800',padding:8},emptyDrafts:{color:'#98a2b3',paddingVertical:6},draftMediaNote:{fontSize:11,color:'#667085',lineHeight:17},draftNotice:{backgroundColor:'#ecfdf3',borderWidth:1,borderColor:'#abefc6',borderRadius:12,padding:12},draftNoticeTitle:{color:'#067647',fontWeight:'900'},draftNoticeText:{color:'#067647',lineHeight:20,marginTop:3},picker:{height:130,borderWidth:1.5,borderStyle:'dashed',borderColor:'#98a2b3',borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},pickerIcon:{fontSize:34,color:'#c8211e'},pickerText:{fontWeight:'900',color:'#344054',marginTop:4},previewGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},previewWrap:{width:'48%',aspectRatio:1,borderRadius:12,overflow:'hidden'},preview:{width:'100%',height:'100%'},videoPreview:{flex:1,backgroundColor:'#101828',alignItems:'center',justifyContent:'center'},videoIcon:{color:'#fff',fontSize:32},videoText:{color:'#fff',fontWeight:'800',marginTop:8},clearMedia:{minHeight:44,justifyContent:'center',paddingHorizontal:6},clearMediaText:{color:'#b42318',fontWeight:'800'},labelRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:6},label:{fontWeight:'900',color:'#344054'},clearDraft:{color:'#b42318',fontWeight:'800',paddingVertical:10},tagsInput:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:13,paddingHorizontal:13,paddingVertical:12,fontSize:16,color:'#101828'},tagsHint:{color:'#667085',fontSize:12,lineHeight:18},input:{minHeight:130,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:13,padding:13,fontSize:16,color:'#101828'},counter:{textAlign:'right',color:'#98a2b3'},notice:{backgroundColor:'#fffaeb',color:'#7a2e0e',padding:12,borderRadius:10,lineHeight:20},progress:{color:'#344054',fontWeight:'800',textAlign:'center'},submit:{minHeight:52,backgroundColor:'#c8211e',paddingVertical:15,borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},disabled:{opacity:.45},submitText:{color:'#fff',fontWeight:'900',fontSize:16},busyText:{color:'#fff',fontWeight:'800'}
});
