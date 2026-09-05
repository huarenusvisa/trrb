import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { CommentRow, listOwnComments } from '../src/api/comments';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import { localeDateTag } from '../src/i18n/i18n-core';
import { withUiTimeout } from '../src/utils/async-state-core';

const STATUS_KEYS = { published: 'myComments.statusPublished', pending: 'myComments.statusPending', hidden: 'myComments.statusHidden', deleted: 'myComments.statusDeleted' } as const;

export default function MyCommentsScreen() {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setItems(await withUiTimeout(listOwnComments(), t('myComments.timeout')));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('myComments.loadFailed'));
    } finally {
      refresh ? setRefreshing(false) : setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);
  useForegroundRetry(Boolean(error), () => void load(true));

  return <><Stack.Screen options={{ title: t('myComments.screenTitle'), headerBackTitle: t('common.back') }} /><ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
    {loading ? <AsyncStatePanel testID="my-comments-loading" title={t('myComments.loadingTitle')} message={t('myComments.loadingBody')} busy /> : error ? <AsyncStatePanel testID="my-comments-error" tone="error" title={t('myComments.unavailable')} message={error} actionLabel={t('myComments.reload')} onAction={() => void load(true)} busy={refreshing} /> : items.length === 0 ? <AsyncStatePanel testID="my-comments-empty" title={t('myComments.emptyTitle')} message={t('myComments.emptyBody')} /> : items.map((item) => {
      const status = t(STATUS_KEYS[item.status]);
      return <Pressable accessibilityRole="button" accessibilityLabel={t('myComments.openArticleA11y', { status })} key={item.id} style={styles.card} onPress={() => router.push(`/article/${item.article_id}`)}>
      <View style={styles.row}><Text style={styles.status}>{status}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleString(localeDateTag(locale))}</Text></View>
      <Text style={[styles.body, item.status !== 'published' && styles.mutedBody]}>{item.status === 'deleted' ? t('myComments.deletedContent') : item.content}</Text>
      <Text style={styles.open}>{t('myComments.openArticle')}</Text>
    </Pressable>; })}
  </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingBottom:40},card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:12},row:{flexDirection:'row',justifyContent:'space-between',gap:10},status:{fontWeight:'800',color:'#c8211e'},time:{fontSize:12,color:'#98a2b3'},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:10},mutedBody:{color:'#98a2b3'},open:{marginTop:12,color:'#c8211e',fontWeight:'800'}});
