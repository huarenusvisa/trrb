import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { CommunityCategory, createCommunityPost } from '../src/api/community';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { useI18n } from '../src/i18n/I18nProvider';
import type { MessageKey } from '../src/i18n/i18n-core';
import { clearCommunityPostDraft, loadCommunityPostDraft, saveCommunityPostDraft } from '../src/storage/communityPostDraft';

const categories: { value: CommunityCategory; label: MessageKey }[] = [
  { value: 'uscis_interview', label: 'community.category.uscisInterview' },
  { value: 'court_experience', label: 'community.category.courtExperience' },
  { value: 'immigration_help', label: 'community.category.immigrationHelp' },
  { value: 'hot_discussion', label: 'community.category.hotDiscussion' },
  { value: 'ice_experience', label: 'community.category.iceExperience' },
  { value: 'lawyer_review', label: 'community.category.lawyerReview' },
  { value: 'tipoff', label: 'community.category.tipoff' },
];

export default function CommunityComposeScreen() {
  const { t } = useI18n();
  const [category, setCategory] = useState<CommunityCategory>('uscis_interview');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [failure, setFailure] = useState('');
  const [message, setMessage] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraft = useRef({ category, title: '', content: '' });

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveCommunityPostDraft(latestDraft.current).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void loadCommunityPostDraft().then((draft) => {
      if (!active || !draft) return;
      latestDraft.current = { category: draft.category, title: draft.title, content: draft.content };
      setCategory(draft.category); setTitle(draft.title); setContent(draft.content); setDraftRestored(true);
    }).catch(() => undefined).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveCommunityPostDraft({ category, title, content }).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [category, content, draftReady, title]);

  const submit = async () => {
    if (busy) return;
    if (title.trim().length < 4) return setMessage(t('communityCompose.titleTooShort'));
    if (content.trim().length < 20) return setMessage(t('communityCompose.contentTooShort'));
    if (!privacyConfirmed) return setMessage(t('communityCompose.privacyRequired'));
    setBusy(true);
    setFailure('');
    setMessage(t('communityCompose.submitting'));
    try {
      const result = await createCommunityPost({
        category,
        content_label: 'personal_experience',
        title: title.trim(),
        content: content.trim(),
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await clearCommunityPostDraft();
      latestDraft.current = { category, title: '', content: '' };
      setMessage(result.message === '发布成功' ? t('communityCompose.published') : t('communityCompose.pending'));
      setTimeout(() => router.replace('/community'), 500);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t('communityCompose.failed'));
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (next: { category?: CommunityCategory; title?: string; content?: string }) => {
    const value = { ...latestDraft.current, ...next };
    latestDraft.current = value;
    if (next.category !== undefined) setCategory(next.category);
    if (next.title !== undefined) setTitle(next.title);
    if (next.content !== undefined) setContent(next.content);
    setDraftRestored(false); setFailure(''); setMessage('');
  };

  const clearDraft = async () => {
    if (busy) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const empty = { category: 'uscis_interview' as CommunityCategory, title: '', content: '' };
    latestDraft.current = empty;
    setCategory(empty.category); setTitle(''); setContent(''); setPrivacyConfirmed(false);
    setDraftRestored(false); setFailure(''); setMessage('');
    await clearCommunityPostDraft().catch(() => undefined);
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: t('communityCompose.screenTitle'), headerBackTitle: t('common.back') }} />
    <Text style={styles.title}>{t('communityCompose.heading')}</Text>
    <Text style={styles.hint}>{t('communityCompose.privacyHint')}</Text>
    {draftRestored ? <View testID="community-compose-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}><Text style={styles.draftNoticeTitle}>{t('communityCompose.draftRestored')}</Text><Text style={styles.draftNoticeText}>{t('communityCompose.draftRestoredBody')}</Text></View> : null}
    <Text style={styles.label}>{t('communityCompose.category')}</Text>
    <View style={styles.categories}>{categories.map((item) => {
      const label = t(item.label);
      return <Pressable accessibilityRole="button" accessibilityLabel={t('communityCompose.categoryA11y', { category: label })} accessibilityState={{ selected: category === item.value, disabled: busy }} disabled={busy} key={item.value} onPress={() => updateDraft({ category: item.value })} style={[styles.category, category === item.value && styles.categoryActive]}>
        <Text style={[styles.categoryText, category === item.value && styles.categoryTextActive]}>{label}</Text>
      </Pressable>
    })}</View>
    <View style={styles.labelRow}><Text style={styles.label}>{t('communityCompose.title')}</Text>{title || content ? <Pressable accessibilityRole="button" accessibilityLabel={t('communityCompose.clearDraftA11y')} disabled={busy} onPress={() => void clearDraft()}><Text style={styles.clearDraft}>{t('communityCompose.clearDraft')}</Text></Pressable> : null}</View>
    <TextInput testID="community-title-input" accessibilityLabel={t('communityCompose.titleA11y')} value={title} onChangeText={(value) => updateDraft({ title: value })} maxLength={120} placeholder={t('communityCompose.titlePlaceholder')} style={styles.input} editable={!busy} />
    <Text style={styles.counter}>{title.length}/120</Text>
    <Text style={styles.label}>{t('communityCompose.content')}</Text>
    <TextInput testID="community-content-input" accessibilityLabel={t('communityCompose.contentA11y')} value={content} onChangeText={(value) => updateDraft({ content: value })} maxLength={12000} multiline placeholder={t('communityCompose.contentPlaceholder')} style={[styles.input, styles.textarea]} editable={!busy} />
    <Text style={styles.counter}>{t('communityCompose.draftCounter', { count: content.length })}</Text>
    <Pressable testID="community-privacy-confirm" accessibilityRole="checkbox" accessibilityLabel={t('communityCompose.privacyA11y')} accessibilityState={{ checked: privacyConfirmed, disabled: busy }} disabled={busy} onPress={() => { setPrivacyConfirmed((value) => !value); setFailure(''); setMessage(''); }} style={styles.confirm}>
      <View style={[styles.checkbox, privacyConfirmed && styles.checkboxChecked]}><Text style={styles.checkmark}>{privacyConfirmed ? '✓' : ''}</Text></View>
      <Text style={styles.confirmText}>{t('communityCompose.privacyConfirm')}</Text>
    </Pressable>
    {failure ? <AsyncStatePanel testID="community-compose-error" title={t('communityCompose.notPublished')} message={`${failure} ${t('communityCompose.failurePreserved')}`} tone="error" actionLabel={t('communityCompose.retry')} onAction={() => void submit()} busy={busy} /> : null}
    {message ? <Text testID="community-compose-message" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.message, message === t('communityCompose.published') && styles.success]}>{message}</Text> : null}
    <Pressable testID="community-submit" accessibilityRole="button" accessibilityLabel={t('communityCompose.submitA11y')} accessibilityState={{ disabled: busy, busy }} onPress={() => void submit()} disabled={busy} style={[styles.submit, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('communityCompose.submit')}</Text>}
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:50},title:{fontSize:28,fontWeight:'900',color:'#101828'},hint:{color:'#667085',lineHeight:21,marginTop:7,marginBottom:20},draftNotice:{backgroundColor:'#ecfdf3',borderWidth:1,borderColor:'#abefc6',borderRadius:12,padding:12,marginBottom:4},draftNoticeTitle:{color:'#067647',fontWeight:'900'},draftNoticeText:{color:'#067647',lineHeight:20,marginTop:3},labelRow:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},label:{fontSize:15,fontWeight:'900',color:'#344054',marginTop:16,marginBottom:8},clearDraft:{color:'#b42318',fontWeight:'800',paddingVertical:10},categories:{flexDirection:'row',flexWrap:'wrap',gap:8},category:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:999,paddingHorizontal:12,paddingVertical:8},categoryActive:{backgroundColor:'#c8211e',borderColor:'#c8211e'},categoryText:{color:'#475467',fontWeight:'800'},categoryTextActive:{color:'#fff'},input:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:13,paddingVertical:12,fontSize:16,color:'#101828'},textarea:{minHeight:190,textAlignVertical:'top'},counter:{textAlign:'right',color:'#98a2b3',marginTop:5},confirm:{flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:20},checkbox:{width:22,height:22,borderWidth:1,borderColor:'#98a2b3',borderRadius:5,alignItems:'center',justifyContent:'center'},checkboxChecked:{backgroundColor:'#c8211e',borderColor:'#c8211e'},checkmark:{color:'#fff',fontWeight:'900'},confirmText:{flex:1,color:'#475467',lineHeight:21},message:{marginTop:16,color:'#b42318',fontWeight:'700'},success:{color:'#067647'},submit:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:15,alignItems:'center',marginTop:18},disabled:{opacity:.65},submitText:{color:'#fff',fontWeight:'900',fontSize:16}
});
