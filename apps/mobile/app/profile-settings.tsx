import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase } from '../src/auth/supabase';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import { mediaStoragePath, PROFILE_MEDIA_BUCKET, publicProfileMediaUrl, uploadPickedAsset } from '../src/social/media';
import { PROFILE_SELECT } from '../src/social/profiles';
import type { SocialProfile } from '../src/social/types';
import { withUiTimeout } from '../src/utils/async-state-core';

function avatarNumber(key: string) {
  const match = key.match(/^avatar_(\d{3})$/);
  return match ? Math.min(120, Math.max(1, Number(match[1]))) : 1;
}
function avatarKey(n: number) { return `avatar_${String(((n - 1 + 120) % 120) + 1).padStart(3, '0')}`; }
function initialAvatarKey(name: string) { return `initial:${Array.from(name.trim())[0]?.toUpperCase() || '用'}`; }

export default function ProfileSettingsScreen() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('avatar_001');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [avatarAsset, setAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowMessages, setAllowMessages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [requiresSignIn, setRequiresSignIn] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await withUiTimeout(
        supabase.auth.getSession(),
        t('profileSettings.sessionTimeout'),
      );
      const user = sessionData.session?.user;
      if (!user) {
        setRequiresSignIn(true);
        setProfile(null);
        setLoadError(t('profileSettings.signInRequiredBody'));
        router.replace('/auth');
        return;
      }
      setRequiresSignIn(false);
      const { data, error } = await withUiTimeout(
        supabase.from('profiles').select(PROFILE_SELECT).eq('id', user.id).single(),
        t('profileSettings.profileTimeout'),
      );
      if (error) throw error;
      if (!data) throw new Error(t('profileSettings.profileMissing'));
      const next = data as SocialProfile;
      setProfile(next); setName(next.display_name || ''); setBio(next.bio || ''); setAvatar(next.avatar_key || 'avatar_001');
      setAvatarPath(next.avatar_path); setCoverPath(next.cover_path); setIsPrivate(next.is_private); setAllowMessages(next.allow_message_requests);
      setLoadError('');
    } catch (error) {
      setProfile(null);
      setLoadError(error instanceof Error ? error.message : t('profileSettings.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);
  useForegroundRetry(Boolean(loadError && !requiresSignIn), () => void loadProfile());

  const dirty = useMemo(() => Boolean(profile && (
    name.trim() !== (profile.display_name || '') || bio.trim() !== (profile.bio || '') || avatar !== profile.avatar_key
    || avatarPath !== profile.avatar_path || coverPath !== profile.cover_path || avatarAsset || coverAsset
    || isPrivate !== profile.is_private || allowMessages !== profile.allow_message_requests
  )), [profile, name, bio, avatar, avatarPath, coverPath, avatarAsset, coverAsset, isPrivate, allowMessages]);

  const pickImage = async (kind: 'avatar' | 'cover') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'avatar' ? [1, 1] : [16, 9],
      quality: 0.86,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 12 * 1024 * 1024) return Alert.alert(t('profileSettings.imageTooLarge'), t('profileSettings.imageTooLargeBody'));
    if (kind === 'avatar') { setAvatarAsset(asset); setAvatarPath(null); }
    else { setCoverAsset(asset); setCoverPath(null); }
  };

  const save = async () => {
    const trimmedName = name.trim(); const trimmedBio = bio.trim();
    if (trimmedName.length < 2 || trimmedName.length > 32) return Alert.alert(t('profileSettings.invalidName'), t('profileSettings.invalidNameBody'));
    if (trimmedBio.length > 240) return Alert.alert(t('profileSettings.bioTooLong'), t('profileSettings.bioTooLongBody'));
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) { setSaving(false); router.replace('/auth'); return; }
    const uploaded: string[] = [];
    try {
      let nextAvatarPath = avatarPath;
      let nextCoverPath = coverPath;
      if (avatarAsset) {
        nextAvatarPath = mediaStoragePath(userId, 'avatar', avatarAsset);
        await uploadPickedAsset(PROFILE_MEDIA_BUCKET, nextAvatarPath, avatarAsset);
        uploaded.push(nextAvatarPath);
      }
      if (coverAsset) {
        nextCoverPath = mediaStoragePath(userId, 'cover', coverAsset);
        await uploadPickedAsset(PROFILE_MEDIA_BUCKET, nextCoverPath, coverAsset);
        uploaded.push(nextCoverPath);
      }
      const payload = {
        display_name: trimmedName, bio: trimmedBio, avatar_key: avatar,
        avatar_path: nextAvatarPath, cover_path: nextCoverPath,
        is_custom_name: true, is_custom_avatar: Boolean(nextAvatarPath),
        is_private: isPrivate, allow_message_requests: allowMessages, updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('profiles').update(payload).eq('id', userId).select(PROFILE_SELECT).single();
      if (error) throw error;
      const oldPaths = [profile?.avatar_path, profile?.cover_path].filter((path): path is string => Boolean(path && path !== nextAvatarPath && path !== nextCoverPath));
      if (oldPaths.length) await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove(oldPaths).catch(() => undefined);
      const next = data as SocialProfile;
      setProfile(next); setName(next.display_name || ''); setBio(next.bio || ''); setAvatar(next.avatar_key || 'avatar_001');
      setAvatarPath(next.avatar_path); setCoverPath(next.cover_path); setAvatarAsset(null); setCoverAsset(null);
      Alert.alert(t('profileSettings.saved'), t('profileSettings.savedBody'));
    } catch (error) {
      if (uploaded.length) await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove(uploaded).catch(() => undefined);
      const message = error instanceof Error ? error.message : t('profileSettings.retryLater');
      Alert.alert(t('profileSettings.saveFailed'), message.includes('display_name_reserved') ? t('profileSettings.reservedName') : message);
    } finally { setSaving(false); }
  };

  if (loading) return <View style={styles.statePage}><AsyncStatePanel testID="profile-settings-loading" title={t('profileSettings.loadingTitle')} message={t('profileSettings.loadingBody')} busy /></View>;
  if (!profile) return <View style={styles.statePage}><AsyncStatePanel
    testID="profile-settings-error"
    tone="error"
    title={requiresSignIn ? t('profileSettings.signInRequired') : t('profileSettings.unavailable')}
    message={loadError || t('profileSettings.checkNetwork')}
    actionLabel={requiresSignIn ? t('profileSettings.goToSignIn') : t('profileSettings.reload')}
    onAction={requiresSignIn ? () => router.replace('/auth') : () => void loadProfile()}
  /></View>;
  const currentAvatar = avatarNumber(avatar);
  const coverUri = coverAsset?.uri || publicProfileMediaUrl(coverPath);

  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.h1}>{t('profileSettings.heading')}</Text><Text style={styles.sub}>{t('profileSettings.description')}</Text>
    <View style={styles.visualCard}>
      <View style={styles.cover}>{coverUri ? <Image source={{ uri: coverUri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <View style={styles.coverFallback} />}</View>
      <View style={styles.avatarFloat}>{avatarAsset ? <Image source={{ uri: avatarAsset.uri }} contentFit="cover" style={styles.avatarImage} /> : <TrRbAvatar avatarKey={avatar} avatarPath={avatarPath} size={88} />}</View>
      <View style={styles.visualActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('profileSettings.customAvatarA11y')} style={styles.smallButton} onPress={() => void pickImage('avatar')}><Text style={styles.smallButtonText}>{t('profileSettings.customAvatar')}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('profileSettings.changeCoverA11y')} style={styles.smallButton} onPress={() => void pickImage('cover')}><Text style={styles.smallButtonText}>{t('profileSettings.changeCover')}</Text></Pressable>
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => { setAvatarAsset(null); setAvatarPath(null); setAvatar(initialAvatarKey(name)); }}><Text style={styles.textButtonText}>{t('profileSettings.initialAvatar')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => { setAvatarAsset(null); setAvatarPath(null); setAvatar(avatarKey(currentAvatar + 1)); }}><Text style={styles.textButtonText}>{t('profileSettings.nextDefaultAvatar')}</Text></Pressable>
        {coverUri ? <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => { setCoverAsset(null); setCoverPath(null); }}><Text style={styles.removeText}>{t('profileSettings.removeCover')}</Text></Pressable> : null}
      </View>
    </View>
    <Text style={styles.label}>{t('profileSettings.name')}</Text><TextInput value={name} onChangeText={setName} maxLength={32} style={styles.input} placeholder={t('profileSettings.namePlaceholder')} autoCapitalize="none" /><Text style={styles.counter}>{name.trim().length}/32</Text>
    <Text style={styles.label}>{t('profileSettings.bio')}</Text><TextInput value={bio} onChangeText={setBio} maxLength={240} style={[styles.input, styles.bio]} placeholder={t('profileSettings.bioPlaceholder')} multiline textAlignVertical="top" /><Text style={styles.counter}>{bio.trim().length}/240</Text>
    <View style={styles.settingCard}><View style={styles.settingCopy}><Text style={styles.settingTitle}>{t('profileSettings.privateAccount')}</Text><Text style={styles.settingMeta}>{t('profileSettings.privateAccountBody')}</Text></View><Switch accessibilityLabel={t('profileSettings.privateAccount')} value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: '#c8211e' }} /></View>
    <View style={styles.settingCard}><View style={styles.settingCopy}><Text style={styles.settingTitle}>{t('profileSettings.allowMessages')}</Text><Text style={styles.settingMeta}>{t('profileSettings.allowMessagesBody')}</Text></View><Switch accessibilityLabel={t('profileSettings.allowMessages')} value={allowMessages} onValueChange={setAllowMessages} trackColor={{ true: '#c8211e' }} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel={t('profileSettings.save')} disabled={!dirty || saving} style={[styles.save, (!dirty || saving) && styles.disabled]} onPress={() => void save()}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('profileSettings.save')}</Text>}</Pressable>
    <View style={styles.danger}><Text style={styles.dangerTitle}>{t('profileSettings.accountSecurity')}</Text><Text style={styles.dangerText}>{t('profileSettings.accountSecurityBody')}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/delete-account')} style={styles.deleteEntry}><Text style={styles.deleteEntryText}>{t('profileSettings.deleteAccount')}</Text></Pressable></View>
    <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>{t('common.back')}</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  statePage:{flex:1,justifyContent:'center',backgroundColor:'#f5f6f8',padding:18},page:{backgroundColor:'#f5f6f8',padding:18,paddingTop:58,paddingBottom:40,minHeight:'100%'},
  h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:20},visualCard:{backgroundColor:'#fff',borderRadius:18,overflow:'hidden',marginBottom:22,borderWidth:1,borderColor:'#eaecf0'},cover:{height:132,backgroundColor:'#dbeafe'},coverFallback:{flex:1,backgroundColor:'#0f4c81'},avatarFloat:{width:98,height:98,borderRadius:49,padding:5,backgroundColor:'#fff',marginTop:-49,marginLeft:18},avatarImage:{width:88,height:88,borderRadius:44},visualActions:{position:'absolute',right:14,top:146,flexDirection:'row',gap:8},smallButton:{backgroundColor:'#c8211e',borderRadius:9,paddingHorizontal:12,paddingVertical:9},smallButtonText:{color:'#fff',fontWeight:'900'},row:{flexDirection:'row',flexWrap:'wrap',gap:6,padding:16,paddingTop:12},textButton:{paddingHorizontal:9,paddingVertical:7},textButtonText:{color:'#475467',fontWeight:'800'},removeText:{color:'#b42318',fontWeight:'800'},label:{fontWeight:'800',color:'#344054',marginBottom:8},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingHorizontal:14,paddingVertical:13,fontSize:16,color:'#101828'},bio:{height:112},counter:{textAlign:'right',color:'#98a2b3',marginTop:5,marginBottom:18},settingCard:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:12,flexDirection:'row',alignItems:'center',gap:12},settingCopy:{flex:1},settingTitle:{fontSize:16,fontWeight:'900',color:'#101828'},settingMeta:{fontSize:13,color:'#667085',lineHeight:19,marginTop:4},save:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center',marginTop:8},disabled:{opacity:.45},saveText:{color:'#fff',fontWeight:'900',fontSize:16},danger:{marginTop:28,paddingTop:22,borderTopWidth:1,borderTopColor:'#d0d5dd'},dangerTitle:{fontWeight:'900',fontSize:18,color:'#101828'},dangerText:{color:'#667085',marginTop:5},deleteEntry:{marginTop:12,borderWidth:1,borderColor:'#b42318',borderRadius:12,padding:13,alignItems:'center'},deleteEntryText:{color:'#b42318',fontWeight:'900'},back:{padding:14,alignItems:'center',marginTop:8},backText:{color:'#475467',fontWeight:'800'}
});
