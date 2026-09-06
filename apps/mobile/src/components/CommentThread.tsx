import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CommentCursor, CommentRow, createComment, deleteOwnComment, likeComment, listComments, reportComment, unlikeComment } from '../api/comments';
import { updateCommentLikeState } from '../api/comment-like-state';
import { supabase } from '../auth/supabase';
import { buildCommentDisplayRows, isOwnComment } from '../community/comment-presentation';
import { AsyncStatePanel } from './AsyncStatePanel';
import { clearCommentDraft, loadCommentDraft, saveCommentDraft } from '../storage/commentDraft';
import { useForegroundRetry } from '../hooks/useForegroundRetry';
import { withUiTimeout } from '../utils/async-state-core';
import { useI18n } from '../i18n/I18nProvider';
import { localeDateTag } from '../i18n/i18n-core';

type ReplyTarget = { id: string; label: string };
type CommentActionKind = 'like' | 'report' | 'delete';
type CommentActionFailure = { kind: CommentActionKind; commentId: string; detail: string };
type BusyCommentAction = { kind: CommentActionKind; commentId: string };

export function CommentThread({ articleId }: { articleId: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<CommentRow[]>([]);
  const [cursor, setCursor] = useState<CommentCursor>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyCommentAction | null>(null);
  const [reportTarget, setReportTarget] = useState<CommentRow | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [actionFailure, setActionFailure] = useState<CommentActionFailure | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadVersion = useRef(0);
  const latestDraft = useRef<{ text: string; parentId: string | null; replyLabel: string | null }>({ text: '', parentId: null, replyLabel: null });

  const load = useCallback(async (append = false) => {
    const version = ++loadVersion.current;
    append ? setLoadingMore(true) : setLoading(true);
    append ? setLoadMoreError('') : setLoadError('');
    try {
      const page = await withUiTimeout(listComments(articleId, append ? cursor : null), t(append ? 'comments.moreTimeout' : 'comments.loadTimeout'));
      if (version !== loadVersion.current) return;
      setItems((old) => append ? [...old, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      if (version !== loadVersion.current) return;
      const detail = error instanceof Error ? error.message : t('comments.unavailable');
      append ? setLoadMoreError(detail) : setLoadError(detail);
    } finally {
      if (version !== loadVersion.current) return;
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [articleId, cursor, t]);

  useEffect(() => {
    loadVersion.current += 1;
    setItems([]); setCursor(null); setLoadError(''); setLoadMoreError(''); setActionFailure(null);
    void load(false);
  }, [articleId]);
  useForegroundRetry(Boolean(loadError), () => void load(false));
  useEffect(() => {
    let active = true;
    let loaded = false;
    setDraftReady(false); setDraftRestored(false); setText(''); setReplyTo(null);
    latestDraft.current = { text: '', parentId: null, replyLabel: null };
    void loadCommentDraft('news', articleId).then((draft) => {
      if (!active) return;
      loaded = true;
      if (!draft) return;
      const nextReply = draft.parentId ? { id: draft.parentId, label: draft.replyLabel || t('comments.userFallback') } : null;
      latestDraft.current = { text: draft.text, parentId: draft.parentId, replyLabel: draft.replyLabel };
      setText(draft.text); setReplyTo(nextReply); setDraftRestored(true);
    }).catch(() => undefined).finally(() => { if (active) { loaded = true; setDraftReady(true); } });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (loaded) void saveCommentDraft('news', articleId, latestDraft.current).catch(() => undefined);
    };
  }, [articleId, t]);
  useEffect(() => {
    if (!draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveCommentDraft('news', articleId, latestDraft.current).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [articleId, draftReady, replyTo, text]);
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setViewerUserId(data.session?.user.id || null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setViewerUserId(session?.user.id || null));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const requireSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    Alert.alert(t('comments.signInTitle'), t('comments.signInBody'), [
      { text: t('comments.cancel'), style: 'cancel' },
      { text: t('comments.signIn'), onPress: () => router.push('/auth') }
    ]);
    return false;
  };

  const submit = async () => {
    if (!text.trim()) return;
    if (!(await requireSession())) return;
    setSending(true);
    setMessage(''); setFailure('');
    try {
      const created = await createComment(articleId, text, replyTo?.id || null);
      const wasReply = Boolean(replyTo);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await clearCommentDraft('news', articleId);
      latestDraft.current = { text: '', parentId: null, replyLabel: null };
      setText(''); setReplyTo(null); setDraftRestored(false); await load(false);
      setMessage(t(created.status === 'published' ? (wasReply ? 'comments.replyPublished' : 'comments.commentPublished') : 'comments.pending'));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t('comments.retryLater'));
    } finally { setSending(false); }
  };

  const updateText = (value: string) => {
    latestDraft.current = { ...latestDraft.current, text: value };
    setText(value); setDraftRestored(false); setFailure(''); setMessage('');
  };

  const updateReply = (target: ReplyTarget | null) => {
    latestDraft.current = { ...latestDraft.current, parentId: target?.id || null, replyLabel: target?.label || null };
    setReplyTo(target); setDraftRestored(false); setFailure(''); setMessage('');
  };

  const onLike = async (comment: CommentRow) => {
    if (!(await requireSession())) return;
    const nextLiked = !comment.viewer_has_liked;
    setBusyAction({ kind: 'like', commentId: comment.id });
    setMessage(''); setActionFailure(null);
    try {
      await withUiTimeout(nextLiked ? likeComment(comment.id) : unlikeComment(comment.id), t(nextLiked ? 'comments.likeTimeout' : 'comments.unlikeTimeout'));
      setItems((current) => updateCommentLikeState(current, comment.id, nextLiked));
      setMessage(t(nextLiked ? 'comments.liked' : 'comments.unliked'));
    } catch (error) {
      setActionFailure({ kind: 'like', commentId: comment.id, detail: error instanceof Error ? error.message : t('comments.likeFailed') });
    } finally { setBusyAction(null); }
  };

  const beginReport = async (comment: CommentRow) => {
    if (!(await requireSession())) return;
    setReportTarget(comment);
    setReportReason('');
    setActionFailure(null);
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setBusyAction({ kind: 'report', commentId: reportTarget.id });
    setMessage(''); setActionFailure(null);
    try {
      await withUiTimeout(reportComment(reportTarget.id, reportReason), t('comments.reportTimeout'));
      setReportTarget(null); setReportReason('');
      setMessage(t('comments.reportSubmitted'));
    } catch (error) {
      setActionFailure({ kind: 'report', commentId: reportTarget.id, detail: error instanceof Error ? error.message : t('comments.reportFailed') });
    } finally { setBusyAction(null); }
  };

  const updateReportReason = (value: string) => {
    setReportReason(value);
    if (actionFailure?.kind === 'report') setActionFailure(null);
  };

  const deleteComment = async (comment: CommentRow) => {
    setBusyAction({ kind: 'delete', commentId: comment.id }); setMessage(''); setActionFailure(null);
    try {
      await withUiTimeout(deleteOwnComment(comment.id), t('comments.deleteTimeout'));
      if (replyTo?.id === comment.id) updateReply(null);
      setItems((current) => current.filter((item) => item.id !== comment.id));
      setMessage(t('comments.deleted'));
    } catch (error) {
      setActionFailure({ kind: 'delete', commentId: comment.id, detail: error instanceof Error ? error.message : t('comments.deleteFailed') });
    } finally { setBusyAction(null); }
  };

  const removeComment = (comment: CommentRow) => {
    Alert.alert(t('comments.deleteTitle'), t('comments.deleteBody'), [
      { text: t('comments.cancel'), style: 'cancel' },
      { text: t('comments.confirmDelete'), style: 'destructive', onPress: () => void deleteComment(comment) }
    ]);
  };

  const displayItems = buildCommentDisplayRows(items);

  return <View testID="news-comments" style={styles.wrap}>
    <Text style={styles.heading}>{t('comments.heading')}</Text>
    <Text style={styles.hint}>{t('comments.hint')}</Text>
    {draftRestored ? <Text testID="news-comment-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}>{replyTo ? t('comments.draftRestoredReply', { name: replyTo.label }) : t('comments.draftRestored')}</Text> : null}
    {replyTo ? <View style={styles.replyBanner}><Text style={styles.replyText}>{t('comments.replyingTo', { name: replyTo.label })}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('comments.cancelReply')} onPress={() => updateReply(null)}><Text style={styles.cancel}>{t('comments.cancel')}</Text></Pressable></View> : null}
    <TextInput testID="news-comment-input" accessibilityLabel={replyTo ? t('comments.replyA11y', { name: replyTo.label }) : t('comments.contentA11y')} value={text} onChangeText={updateText} placeholder={replyTo ? t('comments.replyPlaceholder') : t('comments.commentPlaceholder')} multiline maxLength={3000} style={styles.input} editable={!sending} />
    <Text style={styles.counter}>{t('comments.draftCounter', { count: text.length })}</Text>
    <Pressable testID="news-comment-submit" accessibilityRole="button" accessibilityLabel={t(replyTo ? 'comments.publishReply' : 'comments.publishComment')} accessibilityState={{ disabled: sending || !text.trim(), busy: sending }} style={styles.submit} onPress={submit} disabled={sending || !text.trim()}><Text style={styles.submitText}>{sending ? t('comments.sending') : t(replyTo ? 'comments.publishReply' : 'comments.publishComment')}</Text></Pressable>
    {failure ? <AsyncStatePanel testID="news-comment-error" title={t('comments.notPublished')} message={`${failure} ${t('comments.failurePreserved')}`} tone="error" actionLabel={t('comments.retryPublish')} onAction={() => void submit()} busy={sending} /> : null}
    {message ? <Text testID="news-comment-message" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

    {reportTarget ? <View style={styles.reportBox}>
      <View style={styles.replyBanner}><Text style={styles.replyText}>{t('comments.reportingUser', { name: reportTarget.profiles?.display_name || t('comments.userFallback') })}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('comments.cancelReport')} onPress={() => { setReportTarget(null); setReportReason(''); setActionFailure(null); }}><Text style={styles.cancel}>{t('comments.cancel')}</Text></Pressable></View>
      <TextInput testID="news-comment-report-reason" accessibilityLabel={t('comments.reportReason')} value={reportReason} onChangeText={updateReportReason} placeholder={t('comments.reportPlaceholder')} multiline maxLength={500} style={styles.reportInput} />
      <Pressable testID="news-comment-report-submit" accessibilityRole="button" accessibilityLabel={t('comments.submitReport')} accessibilityState={{ disabled: !reportReason.trim() || Boolean(busyAction), busy: busyAction?.kind === 'report' }} style={styles.reportSubmit} onPress={submitReport} disabled={!reportReason.trim() || Boolean(busyAction)}><Text style={styles.submitText}>{busyAction?.kind === 'report' ? t('comments.submitting') : t('comments.submitReport')}</Text></Pressable>
      {actionFailure?.kind === 'report' && actionFailure.commentId === reportTarget.id ? <AsyncStatePanel testID="news-comment-report-error" title={t('comments.reportNotSubmitted')} message={`${actionFailure.detail} ${t('comments.reportReasonPreserved')}`} tone="error" actionLabel={t('comments.retryReport')} onAction={() => void submitReport()} busy={busyAction?.kind === 'report'} /> : null}
    </View> : null}

    {loading && !items.length ? <View testID="news-comments-loading" accessibilityLiveRegion="polite"><ActivityIndicator style={{ marginTop: 24 }} /><Text style={styles.loadingText}>{t('comments.loading')}</Text></View> : null}
    {loading && items.length ? <Text testID="news-comments-refreshing" accessibilityLiveRegion="polite" style={styles.loadingText}>{t('comments.refreshing')}</Text> : null}
    {loadError ? <AsyncStatePanel testID="news-comments-load-error" title={t(items.length ? 'comments.refreshFailed' : 'comments.unavailableTitle')} message={items.length ? `${loadError} ${t('comments.loadedPreserved')}` : loadError} tone="error" actionLabel={t('comments.reload')} onAction={() => void load(false)} busy={loading} /> : null}
    {!loading && !loadError && items.length === 0 ? <Text testID="news-comments-empty" style={styles.empty}>{t('comments.empty')}</Text> : displayItems.map(({ item, depth, replyToLabel }, index) => <View key={item.id} testID={`news-comment-${index}`} style={[styles.comment, depth > 0 && styles.replyComment]} accessibilityLabel={replyToLabel ? t('comments.replyRelationA11y', { name: item.profiles?.display_name || t('comments.readerFallback'), target: replyToLabel }) : undefined}>
      <View style={styles.commentHead}><Pressable onPress={() => router.push(`/user/${item.user_id}`)}><Text style={styles.name}>{item.profiles?.display_name || t('comments.readerFallback')}</Text></Pressable><Text style={styles.time}>{new Date(item.created_at).toLocaleString(localeDateTag(locale))}</Text></View>
      {replyToLabel ? <Text style={styles.parentTag}>{t('comments.replyingTo', { name: replyToLabel })}</Text> : null}
      <Text style={styles.body}>{item.content}</Text>
      <View style={styles.actions}>
        <Pressable testID={`news-comment-reply-${index}`} accessibilityRole="button" accessibilityLabel={t('comments.replyA11y', { name: item.profiles?.display_name || t('comments.userFallback') })} accessibilityState={{ disabled: Boolean(busyAction) }} onPress={() => updateReply({ id: item.id, label: item.profiles?.display_name || t('comments.userFallback') })} disabled={Boolean(busyAction)}><Text style={styles.action}>{t('comments.reply')}</Text></Pressable>
        <Pressable testID={`news-comment-like-${index}`} accessibilityRole="button" accessibilityLabel={t(item.viewer_has_liked ? 'comments.unlikeA11y' : 'comments.likeA11y', { count: item.like_count })} accessibilityState={{ disabled: Boolean(busyAction), busy: busyAction?.kind === 'like' && busyAction.commentId === item.id, selected: item.viewer_has_liked }} onPress={() => onLike(item)} disabled={Boolean(busyAction)}><Text style={[styles.action, item.viewer_has_liked && styles.likedAction]}>{busyAction?.kind === 'like' && busyAction.commentId === item.id ? t('comments.processing') : t(item.viewer_has_liked ? 'comments.likedCount' : 'comments.likeCount', { count: item.like_count })}</Text></Pressable>
        <Pressable testID={`news-comment-report-${index}`} accessibilityRole="button" accessibilityLabel={t('comments.reportComment')} accessibilityState={{ disabled: Boolean(busyAction) }} onPress={() => beginReport(item)} disabled={Boolean(busyAction)}><Text style={styles.reportAction}>{t('comments.report')}</Text></Pressable>
        {isOwnComment(item, viewerUserId) ? <Pressable testID={`news-comment-delete-${index}`} accessibilityRole="button" accessibilityLabel={t('comments.deleteComment')} accessibilityState={{ disabled: Boolean(busyAction), busy: busyAction?.kind === 'delete' && busyAction.commentId === item.id }} onPress={() => removeComment(item)} disabled={Boolean(busyAction)}><Text style={styles.deleteAction}>{busyAction?.kind === 'delete' && busyAction.commentId === item.id ? t('comments.deleting') : t('comments.delete')}</Text></Pressable> : null}
      </View>
      {actionFailure?.commentId === item.id && actionFailure.kind !== 'report' ? <AsyncStatePanel testID={actionFailure.kind === 'like' ? 'news-comment-like-error' : 'news-comment-delete-error'} title={t(actionFailure.kind === 'like' ? 'comments.likeNotCompleted' : 'comments.deleteNotCompleted')} message={actionFailure.detail} tone="error" actionLabel={t(actionFailure.kind === 'like' ? 'comments.retryLike' : 'comments.retryDelete')} onAction={actionFailure.kind === 'like' ? () => void onLike(item) : () => void deleteComment(item)} busy={busyAction?.commentId === item.id} /> : null}
    </View>)}

    {loadMoreError ? <AsyncStatePanel testID="news-comments-more-error" title={t('comments.moreFailed')} message={loadMoreError} tone="error" actionLabel={t('comments.retryMore')} onAction={() => void load(true)} busy={loadingMore} /> : null}
    {cursor && !loadMoreError ? <Pressable accessibilityRole="button" accessibilityLabel={t('comments.loadMore')} accessibilityState={{ disabled: loadingMore, busy: loadingMore }} style={styles.more} onPress={() => load(true)} disabled={loadingMore}><Text style={styles.moreText}>{loadingMore ? t('comments.loadingMore') : t('comments.loadMore')}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap:{marginTop:38,paddingTop:26,borderTopWidth:1,borderTopColor:'#eaecf0'},heading:{fontSize:24,fontWeight:'900',color:'#101828'},hint:{color:'#667085',marginTop:6,marginBottom:14,lineHeight:20},draftNotice:{color:'#067647',fontWeight:'800',backgroundColor:'#ecfdf3',borderRadius:10,padding:10,marginBottom:9},replyBanner:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#f2f4f7',borderRadius:10,padding:10,marginBottom:8},replyText:{fontWeight:'700',color:'#344054'},cancel:{color:'#c8211e',fontWeight:'800'},input:{minHeight:88,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},counter:{textAlign:'right',color:'#98a2b3',marginTop:5},submit:{backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center',marginTop:10},submitText:{color:'#fff',fontWeight:'800'},message:{marginTop:12,color:'#067647',fontWeight:'700'},reportBox:{marginTop:16,padding:12,backgroundColor:'#fff7ed',borderRadius:12},reportInput:{minHeight:74,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{backgroundColor:'#b42318',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:8},loadingText:{color:'#667085',textAlign:'center',marginTop:8},empty:{color:'#98a2b3',paddingVertical:26,textAlign:'center'},comment:{paddingVertical:18,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},replyComment:{marginLeft:18,paddingLeft:14,borderLeftWidth:3,borderLeftColor:'#f4c7c5',backgroundColor:'#fffafa'},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},name:{fontWeight:'800',color:'#101828'},time:{fontSize:12,color:'#98a2b3'},parentTag:{fontSize:12,color:'#667085',marginTop:5},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},actions:{flexDirection:'row',flexWrap:'wrap',gap:18,marginTop:10},action:{color:'#c8211e',fontWeight:'800'},likedAction:{color:'#7f1d1d'},reportAction:{color:'#667085',fontWeight:'800'},deleteAction:{color:'#b42318',fontWeight:'800'},more:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:14},moreText:{color:'#344054',fontWeight:'800'}
});
