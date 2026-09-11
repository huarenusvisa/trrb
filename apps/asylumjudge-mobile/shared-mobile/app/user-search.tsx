import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { supabase } from '../src/auth/supabase';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { TrRbAvatar } from '../src/components/TrRbAvatar';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import { listDiscoverableProfiles, searchSocialProfiles } from '../src/social/profiles';
import type { SocialProfile } from '../src/social/types';
import { withUiTimeout } from '../src/utils/async-state-core';

export default function UserSearchScreen() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<string | null>(null);

  const discover = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id || null;
      setMe(currentUserId);
      setItems(await withUiTimeout(listDiscoverableProfiles(currentUserId), t('userSearch.timeout'), 14_000));
      setSearched(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('userSearch.loadFailed'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { void discover(); }, [discover]);
  useForegroundRetry(Boolean(error), () => void discover());

  const submit = async () => {
    Keyboard.dismiss();
    const normalized = query.trim();
    if (Array.from(normalized).length < 2) {
      setError(t('userSearch.minimumQuery'));
      return;
    }
    setSearching(true);
    setError('');
    setSearched(true);
    try {
      setItems(await withUiTimeout(searchSocialProfiles(normalized, me), t('userSearch.timeout'), 14_000));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('userSearch.loadFailed'));
    } finally { setSearching(false); }
  };

  const reset = () => {
    setQuery('');
    Keyboard.dismiss();
    void discover();
  };

  return <View style={styles.page}>
    <Stack.Screen options={{ headerShown: true, title: t('userSearch.screenTitle'), headerBackTitle: t('common.back') }} />
    <View style={styles.searchBar}>
      <TextInput
        testID="user-search-input"
        accessibilityLabel={t('userSearch.inputA11y')}
        value={query}
        onChangeText={setQuery}
        placeholder={t('userSearch.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => void submit()}
        style={styles.input}
      />
      <Pressable testID="user-search-submit" accessibilityRole="button" accessibilityLabel={t('userSearch.submitA11y')} disabled={searching} style={[styles.searchButton, searching && styles.disabled]} onPress={() => void submit()}>
        {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchButtonText}>{t('userSearch.submit')}</Text>}
      </Pressable>
    </View>
    {loading ? <View style={styles.stateWrap}><AsyncStatePanel testID="user-search-loading" title={t('userSearch.loadingTitle')} message={t('userSearch.loadingBody')} busy /></View> : <ScrollView testID="user-search-results" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.headingRow}><View style={styles.headingCopy}><Text style={styles.heading}>{t(searched ? 'userSearch.resultsTitle' : 'userSearch.discoverTitle')}</Text><Text style={styles.hint}>{t(searched ? 'userSearch.resultsBody' : 'userSearch.discoverBody')}</Text></View>{searched ? <Pressable accessibilityRole="button" style={styles.reset} onPress={reset}><Text style={styles.resetText}>{t('userSearch.reset')}</Text></Pressable> : null}</View>
      {error ? <AsyncStatePanel testID="user-search-error" tone="error" title={t('userSearch.errorTitle')} message={error} actionLabel={searched ? t('userSearch.retrySearch') : t('userSearch.reload')} onAction={searched ? () => void submit() : () => void discover()} busy={searching} /> : null}
      {!error && !items.length ? <AsyncStatePanel testID="user-search-empty" title={t(searched ? 'userSearch.emptyTitle' : 'userSearch.noSuggestionsTitle')} message={t(searched ? 'userSearch.emptyBody' : 'userSearch.noSuggestionsBody')} /> : null}
      {!error ? items.map((profile) => {
        const name = profile.display_name || t('userProfile.readerFallback');
        return <Pressable testID={`user-search-result-${profile.id}`} accessibilityRole="button" accessibilityLabel={t('userSearch.openProfileA11y', { name })} key={profile.id} style={styles.row} onPress={() => router.push(`/user/${profile.id}`)}>
          <TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={54} label={t('userProfile.avatarA11y', { name })} />
          <View style={styles.copy}><Text style={styles.name}>{name}</Text><Text numberOfLines={2} style={styles.bio}>{profile.bio?.trim() || t(profile.is_private ? 'userProfile.privateAccount' : 'userProfile.bioFallback')}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>;
      }) : null}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},searchBar:{backgroundColor:'#fff',padding:14,flexDirection:'row',gap:9,borderBottomWidth:1,borderBottomColor:'#eaecf0'},input:{flex:1,minHeight:46,borderRadius:12,backgroundColor:'#f2f4f7',paddingHorizontal:14,fontSize:16,color:'#101828'},searchButton:{minWidth:72,minHeight:46,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center',paddingHorizontal:14},searchButtonText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.55},stateWrap:{flex:1,padding:14,justifyContent:'center'},content:{padding:14,paddingBottom:44,gap:9},headingRow:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:5},headingCopy:{flex:1},heading:{fontSize:22,fontWeight:'900',color:'#101828'},hint:{color:'#667085',lineHeight:20,marginTop:4},reset:{minHeight:44,justifyContent:'center',paddingHorizontal:6},resetText:{color:'#c8211e',fontWeight:'800'},row:{backgroundColor:'#fff',borderWidth:1,borderColor:'#eaecf0',borderRadius:16,padding:13,flexDirection:'row',alignItems:'center',gap:12},copy:{flex:1},name:{fontSize:17,fontWeight:'900',color:'#101828'},bio:{fontSize:13,color:'#667085',lineHeight:18,marginTop:4},chevron:{fontSize:27,color:'#98a2b3'}
});
