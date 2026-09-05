import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  CommunityPostDetail,
  createCommunityComment,
  getCommunityPost,
  reportCommunityComment,
  reportCommunityPost,
  toggleCommunityCommentLike,
  toggleCommunityPostLike,
  unpublishCommunityComment,
  unpublishCommunityPost,
} from '../../src/api/community';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { appendCreatedCommunityComment, communityCommentDisplayName, paginateCommunityCommentThreads, removeUnpublishedCommunityComment, visibleThreadCountForComment } from '../../src/community/community-comment-presentation';
import { optimisticCommunityCommentLike, resolveCommunityCommentLike } from '../../src/community/community-comment-like-state';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, type MessageKey } from '../../src/i18n/i18n-core';
import { withUiTimeout } from '../../src/utils/async-state-core';
import { clearCommentDraft, loadCommentDraft, saveCommentDraft } from '../../src/storage/commentDraft';

type ActionFeedback = { title: string; message: string; tone: 'neutral' | 'error'; retry?: () => void };
type ReplyTarget = { id: string; label: string };
type CommentReportState = { commentId: string; reason: string; error: string };

const COMMENT_THREAD_PAGE_SIZE = 15;

const categoryKeys: Record<CommunityPostDetail['post']['category'], MessageKey> = {
  hot_discussion: 'community.category.hotDiscussion', immigration_help: 'community.category.immigrationHelp', court_experience: 'community.category.courtExperience',
  uscis_interview: 'community.category.uscisInterview', ice_experience: 'community.category.iceExperience', lawyer_review: 'community.category.lawyerReview', tipoff: 'community.category.tipoff',
};

export default function CommunityPostScreen() {
  const { locale, t } = useI18n();
  const { id, commentId } = useLocalSearchParams<{ id: string; commentId?: string }>();
  const targetCommentId = typeof commentId === 'string' ? commentId : '';
  const [detail, setDetail] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [comment, setComment] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [busyCommentId, setBusyCommentId] = useState('');
  const [commentLikeError, setCommentLikeError] = useState<{ commentId: string; message: string; desiredLiked: boolean } | null>(null);
  const [commentReport, setCommentReport] = useState<CommentReportState | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [visibleThreadCount, setVisibleThreadCount] = useState(COMMENT_THREAD_PAGE_SIZE);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestComment = useRef('');
  const latestReplyTarget = useRef<ReplyTarget | null>(null);
  const commentInput = useRef<TextInput>(null);
  const scrollView = useRef<ScrollView>(null);
  const commentsOffset = useRef(0);
  const targetCommentOffset = useRef<number | null>(null);
  const scrolledTarget = useRef('');
  const requestSequence = useRef(0);

  const fetchLatest = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!id) return;
    const sequence = ++requestSequence.current;
    if (mode === 'initial') { setLoading(true); setRefreshing(false); setError(''); setRefreshError(''); setDetail(null); }
    else { setRefreshing(true); setRefreshError(''); }
    try {
      const next = await withUiTimeout(getCommunityPost(String(id)), t('community.detailTimeout'), 16_000);
      if (sequence !== requestSequence.current) return;
      setDetail(next); setError(''); setRefreshError(''); setCommentLikeError(null);
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      const message = e instanceof Error ? e.message : t('community.detailLoadFailed');
      if (mode === 'initial') setError(message);
      else setRefreshError(message);
    } finally {
      if (sequence === requestSequence.current) {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    }
  }, [id, t]);

  const load = useCallback(() => fetchLatest('initial'), [fetchLatest]);
  const refresh = useCallback(() => fetchLatest('refresh'), [fetchLatest]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    scrolledTarget.current = '';
    targetCommentOffset.current = null;
  }, [targetCommentId]);
  useEffect(() => {
    if (!detail || !targetCommentId) return;
    setVisibleThreadCount((count) => visibleThreadCountForComment(detail.comments, targetCommentId, count));
  }, [detail, targetCommentId]);
  useForegroundRetry(Boolean(error || refreshError), () => { if (detail) void refresh(); else void load(); });
  useEffect(() => {
    if (!id) return;
    let active = true;
    let loaded = false;
    setDraftReady(false); setDraftRestored(false); setComment(''); setReplyTarget(null); setVisibleThreadCount(COMMENT_THREAD_PAGE_SIZE);
    latestComment.current = ''; latestReplyTarget.current = null;
    void loadCommentDraft('community', String(id)).then((draft) => {
      if (!active) return;
      loaded = true;
      if (!draft) return;
      const restoredTarget = draft.parentId ? { id: draft.parentId, label: draft.replyLabel || t('community.user') } : null;
      latestComment.current = draft.text; latestReplyTarget.current = restoredTarget;
      setComment(draft.text); setReplyTarget(restoredTarget); setDraftRestored(true);
    }).catch(() => undefined).finally(() => { if (active) { loaded = true; setDraftReady(true); } });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (loaded) void saveCommentDraft('community', String(id), {
        text: latestComment.current,
        parentId: latestReplyTarget.current?.id,
        replyLabel: latestReplyTarget.current?.label,
      }).catch(() => undefined);
    };
  }, [id, t]);
  useEffect(() => {
    if (!id || !draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveCommentDraft('community', String(id), {
      text: latestComment.current,
      parentId: latestReplyTarget.current?.id,
      replyLabel: latestReplyTarget.current?.label,
    }).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [comment, draftReady, id, replyTarget]);

  const requireLogin = () => {
    if (detail?.viewerUserId) return true;
    router.push('/auth');
    return false;
  };

  const submitComment = async () => {
    if (!detail || !comment.trim() || busyAction === 'comment' || !requireLogin()) return;
    setBusyAction('comment'); setFeedback(null);
    try {
      const result = await withUiTimeout(createCommunityComment(detail.post.id, comment, replyTarget?.id || null), t('community.commentSubmitTimeout'));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await clearCommentDraft('community', String(id));
      setDetail((current) => current ? appendCreatedCommunityComment(current, result.comment, result.pending) : current);
      latestComment.current = ''; latestReplyTarget.current = null;
      setComment(''); setReplyTarget(null); setDraftRestored(false);
      setFeedback({ title: t(result.pending ? 'community.commentSubmitted' : 'community.commentPublished'), message: t(result.pending ? 'community.commentPendingBody' : 'community.commentPublishedBody'), tone: 'neutral' });
      void refresh();
    } catch (e) { setFeedback({ title: t('community.commentSubmitFailed'), message: e instanceof Error ? e.message : t('community.commentFailed'), tone: 'error', retry: () => void submitComment() }); }
    finally { setBusyAction(''); }
  };

  const updateComment = (value: string) => {
    latestComment.current = value; setComment(value); setDraftRestored(false); setFeedback(null);
  };

  const startReply = (target: ReplyTarget) => {
    latestReplyTarget.current = target; setReplyTarget(target); setDraftRestored(false); setFeedback(null);
    requestAnimationFrame(() => commentInput.current?.focus());
  };

  const cancelReply = () => {
    latestReplyTarget.current = null; setReplyTarget(null); setDraftRestored(false);
  };

  const like = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('like'); setFeedback(null);
    try {
      const result = await withUiTimeout(toggleCommunityPostLike(detail.post.id, !detail.post.viewer_has_liked), t('community.likeTimeoutShort'));
      setDetail((current) => current ? { ...current, post: { ...current.post, like_count: result.like_count, viewer_has_liked: result.liked } } : current);
      setFeedback({ title: t(result.liked ? 'community.liked' : 'community.unliked'), message: t('community.postUpdated'), tone: 'neutral' });
    } catch (e) { setFeedback({ title: t('community.likeActionFailed'), message: e instanceof Error ? e.message : t('community.likeFailure'), tone: 'error', retry: () => void like() }); }
    finally { setBusyAction(''); }
  };

  const submitReport = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('report'); setFeedback(null);
    try {
      await withUiTimeout(reportCommunityPost(detail.post.id, reportReason), t('community.reportTimeout'));
      setReportReason(''); setShowReport(false); setFeedback({ title: t('community.reportSubmitted'), message: t('community.reportReviewBody'), tone: 'neutral' });
    } catch (e) { setFeedback({ title: t('community.reportFailed'), message: e instanceof Error ? e.message : t('community.reportFailure'), tone: 'error', retry: () => void submitReport() }); }
    finally { setBusyAction(''); }
  };

  const removeOwnPost = () => {
    if (!detail) return;
    Alert.alert(t('community.unpublishPost'), t('community.unpublishPostConfirm'), [
      { text: t('community.cancel'), style: 'cancel' },
      { text: t('community.confirmUnpublish'), style: 'destructive', onPress: async () => {
        setBusyAction('delete'); setFeedback(null);
        try { await withUiTimeout(unpublishCommunityPost(detail.post.id), t('community.unpublishPostTimeout')); router.replace('/community'); }
        catch (e) { setFeedback({ title: t('community.unpublishPostFailed'), message: e instanceof Error ? e.message : t('community.unpublishFailed'), tone: 'error', retry: removeOwnPost }); }
        finally { setBusyAction(''); }
      } },
    ]);
  };

  const removeOwnComment = (commentId: string, confirmed = false) => {
    if (!detail || busyCommentId) return;
    const perform = async () => {
      setBusyCommentId(commentId); setFeedback(null);
      try {
        const result = await withUiTimeout(unpublishCommunityComment(commentId), t('community.unpublishCommentTimeout'));
        setDetail((current) => current ? removeUnpublishedCommunityComment(current, result.comment_id, result.comment_count) : current);
        setCommentLikeError((current) => current?.commentId === commentId ? null : current);
        setCommentReport((current) => current?.commentId === commentId ? null : current);
        if (latestReplyTarget.current?.id === commentId) cancelReply();
        setFeedback({ title: t('community.commentUnpublished'), message: t('community.commentUnpublishedBody'), tone: 'neutral' });
      } catch (e) {
        setFeedback({ title: t('community.unpublishCommentFailed'), message: e instanceof Error ? e.message : t('community.unpublishFailed'), tone: 'error', retry: () => removeOwnComment(commentId, true) });
      } finally { setBusyCommentId(''); }
    };
    if (confirmed) { void perform(); return; }
    Alert.alert(t('community.unpublishComment'), t('community.unpublishCommentConfirm'), [
      { text: t('community.cancel'), style: 'cancel' },
      { text: t('community.confirmUnpublish'), style: 'destructive', onPress: () => void perform() },
    ]);
  };

  const likeComment = async (item: CommunityPostDetail['comments'][number], desiredLiked = !item.viewer_has_liked) => {
    if (!requireLogin() || busyCommentId) return;
    const original = item;
    setBusyCommentId(item.id); setCommentLikeError(null);
    setDetail((current) => current ? {
      ...current,
      comments: current.comments.map((entry) => entry.id === item.id ? optimisticCommunityCommentLike(entry, desiredLiked) : entry),
    } : current);
    try {
      const result = await withUiTimeout(toggleCommunityCommentLike(item.id, desiredLiked), t('community.commentLikeTimeout'));
      setDetail((current) => current ? {
        ...current,
        comments: current.comments.map((entry) => entry.id === item.id ? resolveCommunityCommentLike(entry, result) : entry),
      } : current);
    } catch (e) {
      setDetail((current) => current ? {
        ...current,
        comments: current.comments.map((entry) => entry.id === item.id ? {
          ...entry,
          like_count: original.like_count,
          viewer_has_liked: original.viewer_has_liked,
        } : entry),
      } : current);
      setCommentLikeError({
        commentId: item.id,
        message: e instanceof Error ? e.message : t('community.commentLikeFailed'),
        desiredLiked,
      });
    } finally { setBusyCommentId(''); }
  };

  const openCommentReport = (commentId: string) => {
    if (!requireLogin()) return;
    setFeedback(null);
    setCommentReport((current) => current?.commentId === commentId
      ? null
      : { commentId, reason: '', error: '' });
  };

  const submitCommentReport = async (commentId: string) => {
    const current = commentReport;
    if (!current || current.commentId !== commentId || busyCommentId || !requireLogin()) return;
    setBusyCommentId(commentId);
    setCommentReport({ ...current, error: '' });
    try {
      await withUiTimeout(reportCommunityComment(commentId, current.reason), t('community.commentReportTimeout'));
      setCommentReport(null);
      setFeedback({ title: t('community.reportSubmitted'), message: t('community.commentReportReviewBody'), tone: 'neutral' });
    } catch (e) {
      setCommentReport((latest) => latest?.commentId === commentId ? {
        ...latest,
        error: e instanceof Error ? e.message : t('community.commentReportFailed'),
      } : latest);
    } finally { setBusyCommentId(''); }
  };

  if (loading) return <View style={styles.center}><AsyncStatePanel title={t('community.detailLoadingTitle')} message={t('community.detailLoadingBody')} busy /></View>;
  if (!detail) return <View style={styles.center}><AsyncStatePanel testID="community-post-error" title={t('community.detailErrorTitle')} message={error || t('community.detailUnavailable')} tone="error" actionLabel={t('community.reload')} onAction={() => void load()} /></View>;

  const { post, comments, viewerUserId } = detail;
  const ownPost = viewerUserId === post.user_id;
  const commentPage = paginateCommunityCommentThreads(comments, visibleThreadCount);
  const scrollToTarget = () => {
    if (!targetCommentId || targetCommentOffset.current === null || scrolledTarget.current === targetCommentId) return;
    scrolledTarget.current = targetCommentId;
    scrollView.current?.scrollTo({ y: Math.max(0, commentsOffset.current + targetCommentOffset.current - 12), animated: true });
  };
  return <ScrollView ref={scrollView} testID="community-post-detail" style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#c8211e" colors={['#c8211e']} />}>
    <Stack.Screen options={{ headerShown: true, title: t('community.detailScreenTitle'), headerBackTitle: t('common.back') }} />
    <View style={styles.metaRow}><Text style={styles.category}>{t(categoryKeys[post.category])}</Text>{post.status !== 'published' ? <Text style={styles.pending}>{t('community.pending')}</Text> : null}</View>
    <Text style={styles.title}>{post.title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={t('community.viewProfileA11y', { name: post.profiles?.display_name || t('community.userFallback') })} onPress={() => router.push(`/user/${post.user_id}`)}><Text style={styles.author}>{post.profiles?.display_name || t('community.userFallback')} · {new Date(post.created_at).toLocaleString(localeDateTag(locale))}</Text></Pressable>
    <Text style={styles.body}>{post.content}</Text>
    <View style={styles.actions}>
      <Pressable testID="community-like" accessibilityRole="button" accessibilityLabel={t(post.viewer_has_liked ? 'community.unlikeA11y' : 'community.likeA11y', { count: post.like_count || 0 })} accessibilityState={{ disabled: Boolean(busyAction), selected: post.viewer_has_liked }} disabled={Boolean(busyAction)} style={[styles.action, post.viewer_has_liked && styles.likedAction]} onPress={() => void like()}><Text style={[styles.actionText, post.viewer_has_liked && styles.likedActionText]}>{busyAction === 'like' ? t('community.processing') : t(post.viewer_has_liked ? 'community.likedCount' : 'community.likeCount', { count: post.like_count || 0 })}</Text></Pressable>
      <Pressable testID="community-report" accessibilityRole="button" accessibilityLabel={t('community.reportPost')} accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.action} onPress={() => setShowReport((value) => !value)}><Text style={styles.actionText}>{t('community.report')}</Text></Pressable>
      {ownPost ? <Pressable testID="community-unpublish" accessibilityRole="button" accessibilityLabel={t('community.unpublishPost')} accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.dangerAction} onPress={removeOwnPost}><Text style={styles.dangerText}>{busyAction === 'delete' ? t('community.processing') : t('community.unpublishPost')}</Text></Pressable> : null}
    </View>
    {showReport ? <View style={styles.reportBox}><TextInput testID="community-report-reason" accessibilityLabel={t('community.reportReason')} value={reportReason} onChangeText={setReportReason} maxLength={500} multiline placeholder={t('community.reportPlaceholder')} style={styles.reportInput} /><Pressable testID="community-report-submit" accessibilityRole="button" accessibilityLabel={t('community.submitReport')} accessibilityState={{ disabled: busyAction === 'report' }} disabled={busyAction === 'report'} style={styles.reportSubmit} onPress={() => void submitReport()}>{busyAction === 'report' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('community.submitReport')}</Text>}</Pressable></View> : null}
    {feedback ? <AsyncStatePanel testID="community-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? t('community.retryAction') : undefined} onAction={feedback.retry} busy={Boolean(busyAction)} /> : null}
    {refreshing ? <Text testID="community-refreshing" accessibilityLiveRegion="polite" style={styles.syncStatus}>{t('community.syncing')}</Text> : null}
    {refreshError ? <AsyncStatePanel testID="community-refresh-error" title={t('community.refreshFailedTitle')} message={refreshError} tone="error" actionLabel={t('community.refreshAgain')} onAction={() => void refresh()} /> : null}
    <View style={styles.comments} onLayout={(event) => { commentsOffset.current = event.nativeEvent.layout.y; setTimeout(scrollToTarget, 40); }}>
      <Text style={styles.commentsTitle}>{t('community.commentCount', { count: post.comment_count || 0 })}</Text>
      {targetCommentId && comments.some((item) => item.id === targetCommentId) ? <Text testID="community-comment-target-status" accessibilityLiveRegion="polite" style={styles.targetStatus}>{t('community.targetLocated')}</Text> : null}
      {commentPage.hiddenThreadCount ? <Pressable testID="community-comments-load-earlier" accessibilityRole="button" accessibilityLabel={t('community.earlierThreadsA11y', { count: Math.min(COMMENT_THREAD_PAGE_SIZE, commentPage.hiddenThreadCount) })} style={styles.loadEarlier} onPress={() => setVisibleThreadCount((count) => count + COMMENT_THREAD_PAGE_SIZE)}><Text style={styles.loadEarlierText}>{t('community.earlierThreads', { count: commentPage.hiddenThreadCount })}</Text></Pressable> : null}
      {commentPage.rows.length ? commentPage.rows.map(({ item, depth, replyToLabel }) => <View key={item.id} testID={`community-comment-${item.id}`} onLayout={item.id === targetCommentId ? (event) => { targetCommentOffset.current = event.nativeEvent.layout.y; setTimeout(scrollToTarget, 40); } : undefined} style={[styles.commentCard, depth > 0 && styles.replyCard, item.id === targetCommentId && styles.targetComment, { marginLeft: Math.min(depth, 3) * 14 }]}>
        <View style={styles.commentHead}><Pressable accessibilityRole="button" accessibilityLabel={t('community.viewProfileA11y', { name: item.profiles?.display_name || t('community.userFallback') })} onPress={() => router.push(`/user/${item.user_id}`)}><Text style={styles.commentAuthor}>{item.profiles?.display_name || t('community.userFallback')}</Text></Pressable><Text style={styles.commentTime}>{new Date(item.created_at).toLocaleString(localeDateTag(locale))}</Text></View>
        {replyToLabel ? <Text style={styles.replyLabel}>{t('community.replyTo', { name: replyToLabel })}</Text> : null}
        <Text style={styles.commentBody}>{item.content}</Text>
        {item.status !== 'published' ? <Text style={styles.reviewing}>{t('community.commentReviewing')}</Text> : null}
        <View style={styles.commentActions}>
          {item.status === 'published' ? <Pressable testID={`community-comment-like-${item.id}`} accessibilityRole="button" accessibilityLabel={t(item.viewer_has_liked ? 'community.unlikeCommentA11y' : 'community.likeCommentA11y', { count: item.like_count || 0 })} accessibilityState={{ disabled: Boolean(busyCommentId), selected: item.viewer_has_liked, busy: busyCommentId === item.id }} disabled={Boolean(busyCommentId)} style={[styles.commentLikeAction, item.viewer_has_liked && styles.commentLikedAction]} onPress={() => void likeComment(item)}><Text style={[styles.commentLikeText, item.viewer_has_liked && styles.commentLikedText]}>{busyCommentId === item.id ? t('community.processing') : t(item.viewer_has_liked ? 'community.likedCount' : 'community.likeCount', { count: item.like_count || 0 })}</Text></Pressable> : null}
          {viewerUserId && item.status === 'published' ? <Pressable testID={`community-comment-reply-${item.id}`} accessibilityRole="button" accessibilityLabel={t('community.replyA11y', { name: communityCommentDisplayName(item) })} accessibilityState={{ disabled: Boolean(busyCommentId) }} disabled={Boolean(busyCommentId)} style={styles.replyAction} onPress={() => startReply({ id: item.id, label: communityCommentDisplayName(item) })}><Text style={styles.replyActionText}>{t('community.reply')}</Text></Pressable> : null}
          {viewerUserId && viewerUserId !== item.user_id && item.status === 'published' ? <Pressable testID={`community-comment-report-${item.id}`} accessibilityRole="button" accessibilityLabel={t('community.reportComment')} accessibilityState={{ disabled: Boolean(busyCommentId), expanded: commentReport?.commentId === item.id }} disabled={Boolean(busyCommentId)} style={styles.commentReportAction} onPress={() => openCommentReport(item.id)}><Text style={styles.commentReportText}>{t('community.report')}</Text></Pressable> : null}
          {viewerUserId === item.user_id ? <Pressable testID={`community-comment-unpublish-${item.id}`} accessibilityRole="button" accessibilityLabel={t('community.unpublishOwnComment')} accessibilityState={{ disabled: Boolean(busyCommentId), busy: busyCommentId === item.id }} disabled={Boolean(busyCommentId)} style={styles.commentDeleteAction} onPress={() => removeOwnComment(item.id)}><Text style={styles.commentDeleteText}>{busyCommentId === item.id ? t('community.unpublishing') : t('community.unpublish')}</Text></Pressable> : null}
        </View>
        {commentLikeError?.commentId === item.id ? <View testID={`community-comment-like-error-${item.id}`} accessibilityRole="alert" style={styles.commentLikeError}><Text style={styles.commentLikeErrorText}>{commentLikeError.message}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('community.retryCommentLike')} onPress={() => void likeComment(item, commentLikeError.desiredLiked)}><Text style={styles.commentLikeRetry}>{t('community.retry')}</Text></Pressable></View> : null}
        {commentReport?.commentId === item.id ? <View testID={`community-comment-report-form-${item.id}`} style={styles.commentReportBox}><TextInput testID={`community-comment-report-reason-${item.id}`} accessibilityLabel={t('community.commentReportReason')} value={commentReport.reason} onChangeText={(reason) => setCommentReport((current) => current?.commentId === item.id ? { ...current, reason, error: '' } : current)} maxLength={500} multiline placeholder={t('community.reportPlaceholder')} style={styles.commentReportInput} />{commentReport.error ? <Text accessibilityRole="alert" style={styles.commentReportError}>{commentReport.error}</Text> : null}<View style={styles.commentReportButtons}><Pressable accessibilityRole="button" accessibilityLabel={t('community.cancelCommentReport')} disabled={busyCommentId === item.id} onPress={() => setCommentReport(null)}><Text style={styles.cancelReply}>{t('community.cancel')}</Text></Pressable><Pressable testID={`community-comment-report-submit-${item.id}`} accessibilityRole="button" accessibilityLabel={t(commentReport.error ? 'community.retrySubmitCommentReport' : 'community.submitCommentReport')} accessibilityState={{ disabled: busyCommentId === item.id || commentReport.reason.trim().length < 2, busy: busyCommentId === item.id }} disabled={busyCommentId === item.id || commentReport.reason.trim().length < 2} style={[styles.commentReportSubmit, commentReport.reason.trim().length < 2 && styles.disabled]} onPress={() => void submitCommentReport(item.id)}><Text style={styles.primaryText}>{busyCommentId === item.id ? t('community.submitting') : commentReport.error ? t('community.retryReport') : t('community.submitReport')}</Text></Pressable></View></View> : null}
      </View>) : <Text style={styles.empty}>{t('community.noComments')}</Text>}
      {viewerUserId ? <View style={styles.composer}>{draftRestored ? <Text testID="community-comment-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}>{replyTarget ? t('community.draftRestoredReply', { name: replyTarget.label }) : t('community.draftRestored')}</Text> : null}{replyTarget ? <View testID="community-comment-reply-target" style={styles.replyTarget}><Text style={styles.replyTargetText}>{t('community.replyingTo', { name: replyTarget.label })}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('community.cancelReply')} onPress={cancelReply}><Text style={styles.cancelReply}>{t('community.cancel')}</Text></Pressable></View> : null}<TextInput ref={commentInput} testID="community-comment-input" accessibilityLabel={replyTarget ? t('community.replyA11y', { name: replyTarget.label }) : t('community.commentContent')} value={comment} onChangeText={updateComment} editable={busyAction !== 'comment'} maxLength={3000} multiline placeholder={replyTarget ? t('community.replyPlaceholder', { name: replyTarget.label }) : t('community.commentPlaceholder')} style={styles.commentInput} /><Text style={styles.counter}>{t('community.draftCounter', { count: comment.length })}</Text><Pressable testID="community-comment-submit" accessibilityRole="button" accessibilityLabel={replyTarget ? t('community.replyA11y', { name: replyTarget.label }) : t('community.publishComment')} accessibilityState={{ disabled: busyAction === 'comment' || !comment.trim(), busy: busyAction === 'comment' }} disabled={busyAction === 'comment' || !comment.trim()} style={[styles.primary, !comment.trim() && styles.disabled]} onPress={() => void submitComment()}>{busyAction === 'comment' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{replyTarget ? t('community.publishReply') : t('community.publishComment')}</Text>}</Pressable></View> : <Pressable testID="community-comment-login" accessibilityRole="button" accessibilityLabel={t('community.signInToComment')} style={styles.primary} onPress={() => router.push('/auth')}><Text style={styles.primaryText}>{t('community.signInToComment')}</Text></Pressable>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:60,gap:12},center:{flex:1,justifyContent:'center',padding:28},muted:{color:'#667085',textAlign:'center'},metaRow:{flexDirection:'row',alignItems:'center',gap:9},category:{color:'#c8211e',fontWeight:'900'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},author:{color:'#667085',marginTop:12},body:{fontSize:17,lineHeight:29,color:'#1d2939',marginTop:24},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:26},action:{minHeight:44,backgroundColor:'#f2f4f7',borderRadius:10,paddingHorizontal:15,paddingVertical:11,justifyContent:'center'},actionText:{fontWeight:'800',color:'#344054'},likedAction:{backgroundColor:'#fef3f2'},likedActionText:{color:'#b42318'},dangerAction:{minHeight:44,borderWidth:1,borderColor:'#fda29b',borderRadius:10,paddingHorizontal:15,paddingVertical:10,justifyContent:'center'},dangerText:{fontWeight:'800',color:'#b42318'},reportBox:{marginTop:14,backgroundColor:'#fff7ed',borderRadius:12,padding:12},reportInput:{minHeight:78,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{minHeight:44,backgroundColor:'#b42318',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',marginTop:9},syncStatus:{color:'#667085',textAlign:'center',fontWeight:'700'},comments:{marginTop:24,paddingTop:25,borderTopWidth:1,borderTopColor:'#eaecf0'},commentsTitle:{fontSize:23,fontWeight:'900',color:'#101828'},targetStatus:{color:'#067647',fontWeight:'800',backgroundColor:'#ecfdf3',borderRadius:9,padding:9,marginTop:9},loadEarlier:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:10},loadEarlierText:{color:'#175cd3',fontWeight:'800'},commentCard:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},targetComment:{backgroundColor:'#fffaeb',borderWidth:1,borderColor:'#fdb022',borderRadius:10,paddingHorizontal:10},replyCard:{borderLeftWidth:2,borderLeftColor:'#d0d5dd',paddingLeft:12},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},commentAuthor:{fontWeight:'800',color:'#101828'},commentTime:{fontSize:12,color:'#98a2b3'},replyLabel:{fontSize:13,color:'#667085',marginTop:7},commentBody:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},reviewing:{fontSize:12,color:'#b54708',marginTop:7},commentActions:{flexDirection:'row',alignItems:'center',gap:14,marginTop:4},commentLikeAction:{minHeight:36,justifyContent:'center',paddingHorizontal:8,borderRadius:8,backgroundColor:'#f2f4f7'},commentLikedAction:{backgroundColor:'#fef3f2'},commentLikeText:{color:'#475467',fontWeight:'800'},commentLikedText:{color:'#b42318'},commentLikeError:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,backgroundColor:'#fef3f2',borderRadius:8,padding:8,marginTop:6},commentLikeErrorText:{flex:1,color:'#b42318',fontSize:13},commentLikeRetry:{color:'#b42318',fontWeight:'900',padding:4},replyAction:{minHeight:36,justifyContent:'center',paddingRight:18},replyActionText:{color:'#175cd3',fontWeight:'800'},commentReportAction:{minHeight:36,justifyContent:'center',paddingHorizontal:4},commentReportText:{color:'#667085',fontWeight:'800'},commentReportBox:{backgroundColor:'#fff7ed',borderRadius:10,padding:10,marginTop:8,gap:8},commentReportInput:{minHeight:72,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:9,padding:10,textAlignVertical:'top'},commentReportError:{color:'#b42318',fontSize:13},commentReportButtons:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:16},commentReportSubmit:{minHeight:40,backgroundColor:'#b42318',borderRadius:9,paddingHorizontal:14,justifyContent:'center'},commentDeleteAction:{minHeight:36,justifyContent:'center',paddingHorizontal:4},commentDeleteText:{color:'#b42318',fontWeight:'800'},empty:{color:'#98a2b3',paddingVertical:24,textAlign:'center'},composer:{gap:10,marginTop:18},draftNotice:{color:'#067647',fontWeight:'800',backgroundColor:'#ecfdf3',borderRadius:10,padding:10},replyTarget:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#eff8ff',borderRadius:10,padding:10},replyTargetText:{color:'#175cd3',fontWeight:'800'},cancelReply:{color:'#b42318',fontWeight:'800',padding:4},commentInput:{minHeight:100,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},counter:{textAlign:'right',color:'#98a2b3'},primary:{minHeight:44,backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:12},disabled:{opacity:.45},primaryText:{color:'#fff',fontWeight:'800'},
});
